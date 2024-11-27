// src/pioneer-avr-platform.ts

import type {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logging,
    PlatformAccessory,
    PlatformConfig,
    Service,
} from "homebridge";
import { findDevices } from "./discovery";
import PioneerAvrAccessory from "./pioneer-avr-accessory.js";
import * as fs from "fs";
import * as path from "path";
import packageJson from "../package.json"; // Import package.json

type Device = {
    name: string;
    origName: string;
    host: string;
    port: number;
    source: string;
    maxVolume?: number;
    minVolume?: number;
    inputSwitches?: string[];
};

/**
 * PioneerAvrPlatform
 * This class serves as the main entry point for the plugin, where user configuration is parsed,
 * accessories are registered, and discovered devices are managed.
 */
export class PioneerAvrPlatform implements DynamicPlatformPlugin {
    public readonly service: typeof Service;
    public readonly characteristic: typeof Characteristic;
    public platformName: string;
    public pluginName: string;

    // Used to track restored cached accessories
    public accessories: PlatformAccessory[] = [];

    // Configuration constants as instance variables
    private readonly TELNET_PORTS = [23, 24, 8102];
    private readonly TARGET_NAME = "VSX";
    private readonly MAX_ATTEMPTS = 1000;
    private readonly RETRY_DELAY = 10000; // 10 seconds in milliseconds

    /**
     * Cache for storing discovered receivers and their inputs.
     * The structure maps each host to its corresponding input data.
     */
    public cachedReceivers: Map<string, { inputs: { id: string; name: string }[] }> = new Map();
    public devicesFound: any[] = [];


    constructor(
        public readonly log: Logging,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.service = this.api.hap.Service;
        this.characteristic = this.api.hap.Characteristic;

        let platformName = packageJson.platformName || "pioneerAvr2025";
        platformName = platformName.replace(/[^a-zA-Z0-9 ']/g, "");
        platformName = platformName
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
            .trim();

        let pluginName = packageJson.name || "homebridge-pioneer-avr-2025";
        pluginName = pluginName.replace(/[^a-zA-Z0-9 \-']/g, "");
        pluginName = pluginName
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
            .trim();

        this.platformName = platformName || "pioneerAvr2025";
        this.pluginName = pluginName || "homebridge-pioneer-avr-2025";

        this.log.debug("Platform started:", this.platformName, this.pluginName);

        if (
            config.device?.port &&
            !this.TELNET_PORTS.includes(parseInt(config.device.port, 10))
        ) {
            this.TELNET_PORTS.unshift(parseInt(config.device.port, 10));
        }

        if (
            config.port &&
            !this.TELNET_PORTS.includes(parseInt(config.port, 10))
        ) {
            this.TELNET_PORTS.unshift(parseInt(config.port, 10));
        }

        if (
            config.devices &&
            Array.isArray(config.devices) &&
            config.devices.length > 0
        ) {
            for (const device of config.devices) {
                if (
                    device.port &&
                    !this.TELNET_PORTS.includes(parseInt(device.port, 10))
                ) {
                    this.TELNET_PORTS.unshift(parseInt(device.port, 10));
                }
            }
        }

        // Register for the 'didFinishLaunching' event to start device discovery after Homebridge startup
        this.api.on("didFinishLaunching", () => {
            this.discoverDevices();

        });
    }


    /**
     * Cleans up old or invalid cached accessories from Homebridge.
     * Filters cached accessories to remove those no longer managed by the current plugin,
     * identified by matching their plugin name against expected identifiers (e.g., 'homebridge-pioneer-avr', 'vsx').
     * Ensures the cache remains accurate and prevents stale accessories from being loaded.
     */
    public cleanCachedAccessories() {
        const cachedAccessoriesPath = path.join(this.api.user.storagePath(), 'accessories/cachedAccessories');

        // Check if the cachedAccessories file exists
        if (fs.existsSync(cachedAccessoriesPath)) {
            this.log.debug('Found cached accessories file, starting cleanup.');

            // Read and parse the cached accessories JSON file
            const cachedAccessories = JSON.parse(fs.readFileSync(cachedAccessoriesPath, 'utf-8'));

            // Filter accessories to retain only those not related to homebridge-pioneer-avr
            const filteredAccessories = cachedAccessories.filter((accessory: any) => {
                // Convert to lowercase and check for 'homebridge-pioneer-avr' or 'vsx'
                const pluginName = accessory.plugin?.toLowerCase() || '';
                return !(pluginName.includes('homebridge-pioneer-avr') || pluginName.includes('vsx') || pluginName.includes('pioneer'));
            });

            // Check if any accessories were removed
            if (filteredAccessories.length !== cachedAccessories.length) {
                // Write the filtered accessories back to the cachedAccessories file
                fs.writeFileSync(cachedAccessoriesPath, JSON.stringify(filteredAccessories, null, 4), 'utf-8');
                this.log.info(
                    `Removed ${cachedAccessories.length - filteredAccessories.length} cached accessories related to homebridge-pioneer-avr.`
                );
            } else {
                this.log.debug('No cached accessories related to homebridge-pioneer-avr found to remove.');
            }
        } else {
            this.log.debug('Cached accessories file not found, skipping cleanup.');
        }
    }

    /**
     * Retrieves the cached receiver data for a specific host.
     * @param host The host to retrieve inputs for.
     * @returns The cached inputs, or undefined if the host is not found.
     */
    public getCachedInputsForHost(host: string): { id: string; name: string }[] | undefined {
        return this.cachedReceivers.get(host)?.inputs;
    }



    /**
     * Invoked when Homebridge restores cached accessories from disk at startup.
     * Sets up event handlers for each cached accessory.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info("Loading accessory from cache:", accessory.displayName);
        this.accessories.push(accessory);
    }

    /**
     * Initiates the device discovery process or uses a manually configured device.
     * Attempts up to MAX_ATTEMPTS times if no devices are found, with a delay of RETRY_DELAY between attempts.
     */
    async discoverDevices() {
        let needsRestart: boolean = false;

        // Check if the device is manually configured, bypassing discovery
        if (
            this.config &&
            this.config?.devices &&
            Array.isArray(this.config?.devices) &&
            this.config.devices.length > 0
        ) {
            for (const device of this.config.devices) {
                if (
                    device &&
                    (device.host || device.ip) &&
                    String(device.host || device.ip).length > 0
                ) {
                    let addDevice: Device = {
                        name:
                            device.name ||
                            String(device.host || device.ip)
                                .replace(/\.local$/, "")
                                .replace(/[^a-zA-Z0-9 ]/g, ""),
                        origName:
                            device.name ||
                            String(device.host || device.ip)
                                .replace(/\.local$/, "")
                                .replace(/[^a-zA-Z0-9 ]/g, ""),
                        host: device.host || device.ip,
                        port: device.port || 23,
                        source: "pluginConfig",
                    };

                    if (device.minVolume) {
                        addDevice.minVolume = device.minVolume;
                    }

                    if (device.maxVolume) {
                        addDevice.maxVolume = device.maxVolume;
                    }

                    if (device.inputSwitches) {
                        addDevice.inputSwitches = device.inputSwitches;
                    }

                    this.devicesFound.push(addDevice);
                }
            }

            this.log.debug("Using manually configured devices:", this.devicesFound);
        } else if (
            this.config &&
            this.config?.device &&
            (this.config.device.host || this.config.device.ip) &&
            String(this.config.device.host || this.config.device.ip).length >
                0 &&
            this.config.device.port
        ) {
            let addDevice: Device = {
                name:
                    this.config.device.name ||
                    String(this.config.device.host || this.config.device.ip)
                        .replace(/\.local$/, "")
                        .replace(/[^a-zA-Z0-9 ]/g, ""),
                origName:
                    this.config.device.name ||
                    String(this.config.device.host || this.config.device.ip)
                        .replace(/\.local$/, "")
                        .replace(/[^a-zA-Z0-9 ]/g, ""),
                host: this.config.device.host || this.config.device.ip,
                port: this.config.device.port || 23,
                source: "pluginConfig",
            };

            if (this.config.device.minVolume) {
                addDevice.minVolume = this.config.device.minVolume;
            }

            if (this.config.device.maxVolume) {
                addDevice.maxVolume = this.config.device.maxVolume;
            }

            if (this.config.device.inputSwitches) {
                addDevice.inputSwitches = this.config.device.inputSwitches;
            }

            this.devicesFound.push(addDevice);

            this.log.debug("Using manually configured device:", this.devicesFound);
        } else if (
            this.config &&
            (this.config.host || this.config.ip) &&
            String(this.config.host || this.config.ip).length > 0
        ) {


            let name = String(this.config.host || this.config.ip)
            const ip = name.match(
                /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
            );

            if (ip && this.config.name) {
                name = this.config.name;
            }

            let addDevice: Device = {
                name: name.replace(/\.local$/, "")
                    .replace(/[^a-zA-Z0-9 ]/g, ""),
                origName: name,
                host: this.config.host || this.config.ip,
                port: this.config.port || 23,
                source: "pluginConfig",
            };

            this.devicesFound.push(addDevice);
            this.log.debug("Using manually configured device:", this.devicesFound);
        } else {
            const homebridgeConfigPath = path.join(
                this.api.user.storagePath(),
                "config.json",
            );

            try {
                // Load the config.json file
                const homebridgeConfig: any = JSON.parse(
                    fs.readFileSync(homebridgeConfigPath, "utf8"),
                );

                // Check if "pioneerAvrAccessory" exists in accessories
                const pioneerAccessory = homebridgeConfig.accessories?.find(
                    (accessory: any) =>
                        accessory.accessory === "pioneerAvrAccessory",
                );

                // Check if "pioneerAvr2025" platform already exists
                let pioneerPlatform = homebridgeConfig.platforms.find(
                    (platform: any) => platform.name === this.platformName,
                );

                // If not found, create the platform entry
                if (!pioneerPlatform) {
                    pioneerPlatform = {
                        name: this.platformName.replace(/[^a-zA-Z0-9 ]/g, ""),
                        platform: this.platformName,
                    };
                    homebridgeConfig.platforms.push(pioneerPlatform);
                }

                if (
                    pioneerAccessory &&
                    pioneerAccessory.name &&
                    (pioneerAccessory.host || pioneerAccessory.ip || pioneerAccessory.address) &&
                    pioneerAccessory.port
                ) {
                    let name = pioneerAccessory.name;

                    if (pioneerAccessory.model && String(pioneerAccessory.model).length > 2){
                        name = pioneerAccessory.model;
                    }

                    let addDevice: Device = {
                        name: name.replace(/[^a-zA-Z0-9 ]/g, ""),
                        origName: name,
                        host: pioneerAccessory.host || pioneerAccessory.ip || pioneerAccessory.address,
                        port: pioneerAccessory.port,
                        source: "pioneerAccessory",
                    };

                    if (pioneerAccessory.minVolume) {
                        addDevice.minVolume = pioneerAccessory.minVolume;
                    } else if (pioneerAccessory.minVolumeSet) {
                        addDevice.minVolume = pioneerAccessory.minVolumeSet;
                    }

                    if (pioneerAccessory.maxVolume) {
                        addDevice.maxVolume = pioneerAccessory.maxVolume;
                    } else if (pioneerAccessory.maxVolumeSet) {
                        addDevice.maxVolume = pioneerAccessory.maxVolumeSet;
                    }

                    this.devicesFound.push(addDevice);
                    this.log.debug(
                        "Found pioneerAvrAccessory in config.json.",
                        this.devicesFound,
                    );

                    // Ensure the platforms array exists
                    homebridgeConfig.platforms =
                        homebridgeConfig.platforms || [];

                    // Add the "device" entry
                    if (
                        !pioneerPlatform.device ||
                        !pioneerPlatform.device.name ||
                        !pioneerPlatform.device.host
                    ) {
                        pioneerPlatform.devices = [{
                            host: addDevice.host,
                            port: addDevice.port,
                            name: addDevice.name,
                        }];
                        needsRestart = true;
                    }

                    this.log.info(
                        'Updated "' +
                            this.platformName +
                            '" platform in config.json with device info from "pioneerAvrAccessory".',
                    );
                }

                // Move _bridge settings from old config
                if (pioneerAccessory && pioneerAccessory._bridge) {
                    // && !this.config._bridge
                    pioneerPlatform._bridge = pioneerAccessory._bridge;
                    needsRestart = true;
                }

                if (pioneerAccessory && pioneerAccessory.maxVolume) {
                    pioneerPlatform.maxVolume = pioneerAccessory.maxVolume;
                    needsRestart = true;
                }

                if (pioneerAccessory && pioneerAccessory.minVolume) {
                    pioneerPlatform.minVolume = pioneerAccessory.minVolume;
                    needsRestart = true;
                }

                // Remove all "pioneerAvrAccessory" entries from accessories
                if (Array.isArray(homebridgeConfig.accessories)) {
                    const originalLength = homebridgeConfig.accessories.length;
                    homebridgeConfig.accessories =
                        homebridgeConfig.accessories.filter(
                            (accessory: any) =>
                                accessory.accessory !== "pioneerAvrAccessory",
                        );

                    if (
                        homebridgeConfig.accessories.length !== originalLength
                    ) {
                        this.log.debug(
                            'Removed "pioneerAvrAccessory" entries from config.json.',
                        );
                        needsRestart = true;
                    }
                }

                // Save the updated config.json
                fs.writeFileSync(
                    homebridgeConfigPath,
                    JSON.stringify(homebridgeConfig, null, 2),
                    "utf8",
                );
                this.log.debug("Saved updated config.json.");

                if (needsRestart) {
                    this.cleanCachedAccessories();

                    console.log(JSON.stringify(homebridgeConfig, null, 2));
                    console.error("PLEASE RESTART HOMEBRIDGE");
                    console.error("PLEASE RESTART HOMEBRIDGE");
                    console.error("PLEASE RESTART HOMEBRIDGE");
                    process.exit();
                    return;
                }
            } catch (error) {
                this.log.error(
                    "Error updating config.json for pioneerAvrAccessory:",
                    error,
                );
            }

            let attempts = 0;

            // Retry discovery up to MAX_ATTEMPTS times if no devices are found
            while (attempts < this.MAX_ATTEMPTS && this.devicesFound.length === 0) {
                attempts++;
                const maxDevices = 5;
                const discoveredDevices = await findDevices(
                    this.TARGET_NAME,
                    this.TELNET_PORTS,
                    this.log,
                    maxDevices,
                );

                // If devices are found, add them to this.devicesFound and exit loop
                if (discoveredDevices.length > 0) {
                    for (const dDevice of discoveredDevices) {
                        this.devicesFound.push({
                            name: dDevice.name,
                            origName: dDevice.origName,
                            host: dDevice.host,
                            port: dDevice.port,
                            source: dDevice.source,
                            minVolume: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase()
                            )?.minVolume || undefined,
                            maxVolume: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase()
                            )?.maxVolume || undefined,
                            inputSwitches: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase()
                            )?.inputSwitches || [],
                        });
                    }
                    this.log.debug("Discovered devices:", this.devicesFound);
                    break;
                }

                // Log warning and wait before next attempt if no devices were found
                this.log.warn(
                    `Attempt ${attempts} of ${this.MAX_ATTEMPTS}: No devices found. Retrying in ${this.RETRY_DELAY / 1000} seconds...`,
                );
                if (attempts < this.MAX_ATTEMPTS) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.RETRY_DELAY),
                    );
                }
            }

            // Log error if all attempts failed and no devices were found
            if (this.devicesFound.length === 0) {
                this.log.error(
                    "No devices found after maximum retry attempts. Please configure manually.",
                );
                return;
            }
        }

        // Process each device found or manually configured
        // await this.loopDevices(this.devicesFound);
        this.loopDevices(this.devicesFound);
        this.updateConfigSchema(this.devicesFound);
    }

    /**
     * Updates the config.schema.json file with the current device settings and inputs.
     */
    public updateConfigSchema(
        foundDevicesin: any[],
        host?: string,
        inputs?: { id: string; name: string; type: number }[]

    ): void {
        // Cache inputs if both host and inputs are provided
        if (host && inputs) {
            this.cachedReceivers.set(host, { inputs });
        }

        // this.log.debug('updateConfigSchema() called', host, inputs);

        if (foundDevicesin.length === 0) return;

        let foundDevices = JSON.parse(JSON.stringify(foundDevicesin));

        try {
            const schemaPath = path.resolve(__dirname, "../config.schema.json");

            if (!fs.existsSync(schemaPath)) {
                this.log.error(
                    `Config schema file not found at path: ${schemaPath}`
                );
                return;
            }

            const rawSchema = fs.readFileSync(schemaPath, "utf8");
            let schema;

            try {
                schema = JSON.parse(rawSchema);
            } catch (error) {
                this.log.debug("Failed to parse config.schema.json:", error);
                return;
            }

            if (!schema.schema || !schema.schema.properties) {
                this.log.debug(
                    "Schema properties are missing in config.schema.json."
                );
                return;
            }

            if (!schema.schema.properties.devices) {
                schema.schema.properties.devices = {
                    type: "array", // array
                    title: "Devices",
                    description:
                        "Add multiple Pioneer AVR devices to your configuration.",
                    items: {
                        type: "object",
                        title: "Device Configuration",

                        properties: {},
                    },
                };
            }

            schema.schema.properties.devices.default = []; // Initialize as an empty array
            schema.schema.properties.devices.minItems = 0;

            let firstDevice = foundDevices[0];

            schema.schema.properties.devices.items.properties.port = {
                type: "integer",
                title: "Device Port",
                description: `Enter the port number for the device connection (e.g., 23 or 8102). To open the port, visit: http://${firstDevice.host || "vsx-922.local"}/1000/port_number.asp`,
                placeholder: firstDevice.port || "23",
            };

            if (firstDevice.source !== "bonjour" && firstDevice.port) {
                schema.schema.properties.devices.items.properties.port.default =
                    firstDevice.port;
            }

            schema.schema.properties.devices.items.properties.name = {
                type: "string",
                title: "Device Name",
                description: "Enter the name of the device visible in HomeKit.",
                placeholder: String(firstDevice.name || "VSX922").replace(
                    /[^a-zA-Z0-9]/g,
                    ""
                ),
            };

            if (firstDevice.source !== "bonjour" && firstDevice.name) {
                schema.schema.properties.devices.items.properties.name.default =
                    firstDevice.name.replace(/[^a-zA-Z0-9 ]/g, "");
            }

            schema.schema.properties.devices.items.properties.host = {
                type: "string",
                title: "Device IP Address",
                description:
                    "Enter the IP address or the DNS name of the device (e.g., VSX-922.local).",
                placeholder: firstDevice.host || "192.168.1.99",
            };

            if (firstDevice.source !== "bonjour" && firstDevice.host) {
                schema.schema.properties.devices.items.properties.host.default =
                    firstDevice.host;
            }

            schema.schema.properties.devices.items.properties.minVolume = {
                type: "integer",
                title: "Minimum Volume",
                description:
                    "Set the minimum volume level (0-100). Overrides global setting.",
                minimum: 0,
                maximum: 100,
                placeholder: this.config.minVolume || 30
            };

            if (firstDevice.source !== "bonjour" && firstDevice.minVolume) {
                schema.schema.properties.devices.items.properties.minVolume.default =
                    parseInt(firstDevice.minVolume, 10);
            }

            schema.schema.properties.devices.items.properties.maxVolume = {
                type: "integer",
                title: "Maximum Volume Setting (Lightbulb)",
                description:
                    "Set the maximum volume level (0-100). Overrides global setting.",
                minimum: 0,
                maximum: 100,
                placeholder: this.config.maxVolume || 65
            };

            if (firstDevice.source !== "bonjour" && firstDevice.maxVolume) {
                schema.schema.properties.devices.items.properties.maxVolume.default =
                    parseInt(firstDevice.maxVolume, 10);
            }

            let bonjourCounter = 0;
            for (const foundDevice of foundDevices) {
                if (foundDevice.source === "bonjour") {
                    bonjourCounter++;
                }
            }





            const allInputs = [...this.cachedReceivers.entries()].flatMap(([host, device]) =>
                (device.inputs || []).map((input) => ({
                    id: input.id,
                    name: input.name,
                    host,
                }))
            );

            const groupedById = allInputs.reduce((acc, input) => {
                if (!acc[input.id]) {
                    acc[input.id] = [];
                }
                acc[input.id].push(input);
                return acc;
            }, {} as Record<string, { id: string; name: string; host: string }[]>);

            const uniqueInputs = Object.values(groupedById).flatMap((inputs) => {
                if (inputs.length === 1) {
                    const input = inputs[0];
                    return [{ id: input.id, name: `${input.name} (${input.id})` }];
                } else {
                    return inputs.map((input) => ({
                        id: input.id,
                        name: `${input.name} (${input.id}) ${input.host}`,
                    }));
                }
            }).sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));




            const enums = uniqueInputs.map((input) => input.id);
            const enumNames = uniqueInputs.map((input) => input.name);

            if (bonjourCounter !== foundDevices.length) {
                schema.schema.properties.devices.items.properties.inputSwitches = {
                    type: "array",
                    title: "Input Switches to Expose",
                    description:
                        "Select up to 5 inputs to expose as switches in HomeKit.",
                    items: {
                        type: "string"
                    },
                    uniqueItems: true,
                    maxItems: 5,
                    minItems: 0,
                    default: [],
                }

                if (enums.length > 0) {
                    schema.schema.properties.devices.items.properties.inputSwitches.items.enum =
                        enums;
                    schema.schema.properties.devices.items.properties.inputSwitches.items.enumNames =
                        enumNames;
                } else if (schema.schema.properties.devices.items.properties.inputSwitches) {
                    delete schema.schema.properties.devices.items.properties.inputSwitches;
                }
            } else if (schema.schema.properties.devices.items.properties.inputSwitches) {
                delete schema.schema.properties.devices.items.properties.inputSwitches;
            }


            if (bonjourCounter > 0) {
                schema.schema.properties.discoveredDevices = {
                    type: "array",
                    title: "Discovered Devices",
                    items: {
                        type: "object",
                        properties: {
                            host: {
                                type: "string",
                                title: "Host (IP or DNS Name) Dont change.",
                                readOnly: true,
                            },
                            maxVolume: {
                                type: "integer",
                                title: "Maximum Volume Setting (Lightbulb)",
                                description:
                                    "Set the maximum volume level (0-100). Overrides global setting.",
                                minimum: 0,
                                maximum: 100
                            },
                            minVolume: {
                                type: "integer",
                                title: "Minimum Volume",
                                description:
                                    "Set the minimum volume level (0-100). Overrides global setting.",
                                minimum: 0,
                                maximum: 100,
                                placeholder: this.config.minVolume || 30
                            },
                            inputSwitches: {
                                type: "array",
                                title: "Input Switches to Expose",
                                description:
                                    "Select up to 5 inputs to expose as switches in HomeKit.",
                                items: {
                                    type: "string"
                                },
                                uniqueItems: true,
                                maxItems: 5,
                                default: [],
                            },
                        },
                        required: ["host"],
                    },
                    default: [],
                };

                if (enums.length > 0) {
                    schema.schema.properties.discoveredDevices.items.properties.inputSwitches.items.enum =
                        enums;
                    schema.schema.properties.discoveredDevices.items.properties.inputSwitches.items.enumNames =
                        enumNames;
                } else if (schema.schema.properties.discoveredDevices && schema.schema.properties.discoveredDevices.items.properties.inputSwitches) {
                    delete schema.schema.properties.discoveredDevices.items.properties.inputSwitches;
                }
            } else if (schema.schema.properties.discoveredDevices && schema.schema.properties.discoveredDevices.items.properties.inputSwitches) {
                delete schema.schema.properties.discoveredDevices.items.properties.inputSwitches;
            }

            for (const foundDevice of foundDevices) {
                const cachedInputs =
                    this.cachedReceivers.get(foundDevice.host)?.inputs || [];
                const deviceInputs =
                    inputs && host && foundDevice.host && host.toLowerCase() === foundDevice.host.toLowerCase() ? inputs : cachedInputs;
                // const inputSwitches = deviceInputs.map((input) => input.id);
                // const inputSwitchesEnumNames = deviceInputs.map(
                //     (input) => `${input.name} (${input.id})`
                // );
                let existingConfigInputSwitches =
                    this.config.discoveredDevices?.find(
                        (device: any) => device.host.toLowerCase() === foundDevice.host.toLowerCase()
                    )?.inputSwitches || []; //inputSwitches.slice(0, 3);

                // Validate inputSwitches only if deviceInputs is not empty
                if (deviceInputs.length > 0) {
                    const validInputIds = deviceInputs.map((input) => input.id);

                    // Filter out invalid switches
                    existingConfigInputSwitches = existingConfigInputSwitches.filter((switchId) =>
                        validInputIds.includes(switchId)
                    );
                }

                let addDevice: {
                    name: any;
                    host: any;
                    port: any;
                    maxVolume?: any;
                    minVolume?: any;
                    inputSwitches?: string[];
                } = {
                    name: foundDevice.name,
                    host: foundDevice.host,
                    port: foundDevice.port,
                    maxVolume: foundDevice.maxVolume
                        ? parseInt(foundDevice.maxVolume, 10)
                        : undefined,
                    minVolume: foundDevice.minVolume
                        ? parseInt(foundDevice.minVolume, 10)
                        : undefined,
                    inputSwitches: existingConfigInputSwitches,
                };

                foundDevice.inputSwitches = existingConfigInputSwitches;

                if (foundDevice.source === "bonjour") {
                    schema.schema.properties.discoveredDevices.default.push(
                        addDevice
                    );
                } else {
                    schema.schema.properties.devices.default.push(addDevice);
                }
            }



            if (bonjourCounter === 0) {
                if (schema.schema.properties.discoveredDevices) {
                    delete schema.schema.properties.discoveredDevices;
                }
            } else {
                const schemaDiscoveredDevices = schema.schema.properties.discoveredDevices;
                schema.schema.properties = {
                    discoveredDevices: schemaDiscoveredDevices,
                    ...Object.fromEntries(
                        Object.entries(schema.schema.properties).filter(
                            ([key]) => key !== "discoveredDevices"
                        )
                    ),
                };
            }


            const dynamicHost = firstDevice.host || "vsx-922.local";
            const dynamicHeaderLink = `To open a telnet port on the receiver or set Network Standby, click here: [http://${dynamicHost}/1000/port_number.asp](http://${dynamicHost}/1000/port_number.asp).`;

            if (!schema.headerDisplay) {
                schema.headerDisplay = `# Configuration\n\n${dynamicHeaderLink}`;
            } else {
                const regex =
                    /To open a telnet port on the receiver or set Network Standby, click here: \[http:\/\/.*?\/1000\/port_number\.asp\]\(http:\/\/.*?\/1000\/port_number\.asp\)\./;
                schema.headerDisplay = schema.headerDisplay
                    .replace(regex, "")
                    .trim();
                schema.headerDisplay += `\n\n${dynamicHeaderLink}`;
            }

            fs.writeFileSync(
                schemaPath,
                JSON.stringify(schema, null, 4),
                "utf8"
            );

            this.log.debug("Updated config.schema.json successfully.");


            if (schema.schema.properties.discoveredDevices && schema.schema.properties.discoveredDevices.default.length > 0) {

                // for (const device of schema.schema.properties.discoveredDevices.default) {
                //     if (device.inputSwitches && Array.isArray(device.inputSwitches) && device.inputSwitches.length > 0) {
                //         this.addInputSwitch(device.host, device.inputSwitches);
                //     }
                // }


                const configPath = path.resolve(__dirname, "../config.json");

                try {
                    // Read the existing config.json
                    const rawConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "{}";
                    const config = JSON.parse(rawConfig);

                    // Ensure the discoveredDevices array exists in the config.json
                    if (!Array.isArray(config.discoveredDevices)) {
                        config.discoveredDevices = [];
                    }

                    // Update discoveredDevices in config.json with the default values from schema
                    const discoveredDevicesFromSchema = schema.schema.properties.discoveredDevices.default;
                    const updatedDiscoveredDevices = discoveredDevicesFromSchema.map((device: { host: string }) => ({
                        host: device.host, // Include only host
                    }));

                    // Avoid duplicates by checking for existing devices in config.json
                    updatedDiscoveredDevices.forEach((newDevice) => {
                        if (!config.discoveredDevices.some((device: { host: string }) => device.host.toLowerCase() === newDevice.host.toLowerCase())) {
                            config.discoveredDevices.push(newDevice);
                        }
                    });

                    // Write back the updated config.json
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8");

                    this.log.debug("Successfully updated discoveredDevices in config.json.");
                } catch (error) {
                    this.log.error("Failed to update config.json with discoveredDevices:", error);
                }
            }

        } catch (error) {
            this.log.error("Failed to update config.schema.json: ", error);
        }

    }


    /**
     * Processes each discovered or manually configured device asynchronously.
     * Registers or restores devices in Homebridge as necessary.
     *
     * @param foundDevices - List of devices found during discovery or configured manually
     */
    async loopDevices(foundDevices: any[]) {
        for (const foundDevice of foundDevices) {
            // this.log.debug('Processing device:', foundDevice);

            try {
                // Generate a unique name to avoid duplicate accessory names in Homebridge
                let uniqueName = foundDevice.name.replace(/[^a-zA-Z0-9]/g, "");
                let counter = 1;

                if (foundDevices.length > 1) {
                    // Check if another accessory with the same name already exists
                    while (foundDevices.some((fd) => fd.name === uniqueName)) {
                        uniqueName = `${foundDevice.name}_${counter}`;
                        counter++;
                    }
                }

                // Log the renaming if necessary
                if (
                    uniqueName !== foundDevice.name.replace(/[^a-zA-Z0-9]/g, "")
                ) {
                    this.log.warn(
                        `Device with name "${foundDevice.name.replace(/[^a-zA-Z0-9]/g, "")}" already exists. Renaming to "${uniqueName}".`,
                    );
                }

                // Generate a unique identifier (UUID) for the accessory based on device information
                const uuid = this.api.hap.uuid.generate(
                    String(uniqueName) + String(foundDevice.host),
                );

                // Check if an accessory with this UUID is already registered in Homebridge
                const existingAccessory = this.accessories.find(
                    (accessory) => accessory.UUID === uuid,
                );

                if (existingAccessory) {
                    // Restore the existing accessory from cache
                    this.log.debug(
                        "Restoring existing accessory from cache:",
                        existingAccessory.displayName,
                    );
                    new PioneerAvrAccessory(
                        foundDevice,
                        this,
                        existingAccessory,
                    );
                } else {
                    this.log.debug(
                        "Adding new accessory:",
                        uniqueName,
                        foundDevice,
                    );

                    // Initialize a new accessory instance with the unique name and set device context
                    const accessory = new this.api.platformAccessory(
                        uniqueName,
                        uuid,
                    );
                    accessory.context.device = {
                        ...foundDevice,
                        name: uniqueName,
                    };

                    // Initialize the accessory and wait for it to be ready
                    new PioneerAvrAccessory(foundDevice, this, accessory);

                    // Register the accessory with Homebridge once it is fully initialized
                    this.api.registerPlatformAccessories(
                        this.pluginName,
                        this.platformName,
                        [accessory],
                    );
                }
            } catch (e) {
                this.log.debug("Error processing device in loopDevices:", e);
            }
        }
    }
}
