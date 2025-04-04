// src/pioneer-avr-platform.ts

import type {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logging,
    PlatformAccessory,
    PlatformConfig,
    Service,
} from 'homebridge';

let HAPStorage: any;
try {
  HAPStorage = require('hap-nodejs').HAPStorage;
} catch (error) {
  HAPStorage = {};
}

import { findDevices } from './discovery';
import PioneerAvrAccessory from './pioneer-avr-accessory.js';
import * as fs from 'fs';
import * as path from 'path';
import packageJson from '../package.json'; // Import package.json
import { addExitHandler } from './exitHandler';

export interface Device {
    name: string;
    origName: string;
    host: string;
    port: number;
    source: string;
    fqdn: string,
    maxVolume?: number;
    minVolume?: number;
    inputSwitches?: string[];
    listeningMode?: string;
    listeningModeFallback?: string;
    listeningModeOther?: string;
}

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
    private prefsDir: string;
    private homebridgeConfigPath: string = '';

    // Used to track restored cached accessories
    public accessories: PlatformAccessory[] = [];

    // Configuration constants as instance variables
    private readonly TELNET_PORTS = [23, 24, 8102];
    private readonly TARGET_NAME = 'VSX';
    private readonly MAX_ATTEMPTS = 1000;
    private readonly RETRY_DELAY = 10000; // 10 seconds in milliseconds

    /**
     * Cache for storing discovered receivers and their inputs.
     * The structure maps each host to its corresponding input data.
     */
    public cachedReceivers = new Map<string, { inputs: { id: string; name: string }[] }>();
    public devicesFound: any[] = [];


    constructor(
        public readonly log: Logging,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.service = this.api.hap.Service;
        this.characteristic = this.api.hap.Characteristic;

        let platformName = packageJson.platformName || 'pioneerAvr2025';
        platformName = platformName.replace(/[^a-zA-Z0-9 ']/g, '');
        platformName = platformName
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
            .trim();

        let pluginName = packageJson.name || 'homebridge-pioneer-avr-2025';
        pluginName = pluginName.replace(/[^a-zA-Z0-9 \-']/g, '');
        pluginName = pluginName
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
            .trim();

        this.platformName = platformName || 'pioneerAvr2025';
        this.pluginName = pluginName || 'homebridge-pioneer-avr-2025';

        const storagePath = typeof (HAPStorage as any).storagePath === 'function'
          ? (HAPStorage as any).storagePath() // Homebridge v2+
          : this.api.user.storagePath(); // Homebridge v1


        this.prefsDir =
            this.config.prefsDir ||
            storagePath + '/pioneerAvr/';


        this.homebridgeConfigPath = path.join(storagePath, 'config.json');

        const possiblePaths = [
            path.join(storagePath, 'config.json'),
            path.join(this.prefsDir, 'config.json'),
            path.resolve(__dirname, '../config.json')
        ];

        for (const configPath of possiblePaths) {
            if (fs.existsSync(configPath)) {
                this.homebridgeConfigPath = configPath;
                break;
            }
        }

        this.log.debug('Platform started:', this.platformName, this.pluginName);

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
        this.api.on('didFinishLaunching', () => {
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
      const storagePath = typeof (HAPStorage as any).storagePath === 'function'
        ? (HAPStorage as any).storagePath() // Homebridge v2+
        : this.api.user.storagePath(); // Homebridge v1

        const cachedAccessoriesPath = path.join(storagePath, 'accessories/cachedAccessories');

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
                    `Removed ${cachedAccessories.length - filteredAccessories.length} cached accessories related to homebridge-pioneer-avr.`,
                );
            } else {
                this.log.debug('No cached accessories related to homebridge-pioneer-avr found to remove.');
            }
        } else {
            this.log.debug('Cached accessories file not found, skipping cleanup.');
        }
    }

    // /**
    //  * Retrieves the cached receiver data for a specific host.
    //  * @param host The host to retrieve inputs for.
    //  * @returns The cached inputs, or undefined if the host is not found.
    //  */
    // public getCachedInputsForHost(host: string): { id: string; name: string }[] | undefined {
    //     return this.cachedReceivers.get(host)?.inputs;
    // }


    /**
     * Invoked when Homebridge restores cached accessories from disk at startup.
     * Sets up event handlers for each cached accessory.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }




    /**
     * Initiates the device discovery process or uses a manually configured device.
     * Attempts up to MAX_ATTEMPTS times if no devices are found, with a delay of RETRY_DELAY between attempts.
     */
    async discoverDevices() {
        // Check if the device is manually configured, bypassing discovery
        if (
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
                    const addDevice: Device = {
                        name:
                            device.name ||
                            String(device.host || device.ip)
                                .replace(/\.local$/, '')
                                .replace(/[^a-zA-Z0-9 ]/g, ''),
                        origName:
                            device.name ||
                            String(device.host || device.ip)
                                .replace(/\.local$/, '')
                                .replace(/[^a-zA-Z0-9 ]/g, ''),
                        host: device.host || device.ip,
                        port: device.port || 23,
                        source: 'pluginConfig',
                        fqdn: device.host || device.ip,
                    };

                    if (device.listeningMode) {
                        addDevice.listeningMode = device.listeningMode;
                    }

                    if (device.listeningModeFallback) {
                        addDevice.listeningModeFallback = device.listeningModeFallback;
                    }

                    if (device.listeningModeOther) {
                        addDevice.listeningModeOther = device.listeningModeOther;
                    }

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

        } else if (
            this.config?.device &&
            (this.config.device.host || this.config.device.ip) &&
            String(this.config.device.host || this.config.device.ip).length >
                0 &&
            this.config.device.port
        ) {
            const addDevice: Device = {
                name:
                    this.config.device.name ||
                    String(this.config.device.host || this.config.device.ip)
                        .replace(/\.local$/, '')
                        .replace(/[^a-zA-Z0-9 ]/g, ''),
                origName:
                    this.config.device.name ||
                    String(this.config.device.host || this.config.device.ip)
                        .replace(/\.local$/, '')
                        .replace(/[^a-zA-Z0-9 ]/g, ''),
                host: this.config.device.host || this.config.device.ip,
                port: this.config.device.port || 23,
                source: 'pluginConfig',
                fqdn: this.config.device.host || this.config.device.ip,
            };

            if (this.config.device.listeningMode) {
                addDevice.listeningMode = this.config.device.listeningMode;
            }

            if (this.config.device.listeningModeFallback) {
                addDevice.listeningModeFallback = this.config.device.listeningModeFallback;
            }

            if (this.config.device.listeningModeOther) {
                addDevice.listeningModeOther = this.config.device.listeningModeOther;
            }

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
        } else if (
            this.config &&
            (this.config.host || this.config.ip) &&
            String(this.config.host || this.config.ip).length > 0
        ) {


            let name = String(this.config.host || this.config.ip);
            const ip = name.match(
                /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
            );

            if (ip && this.config.name) {
                name = this.config.name;
            }

            const addDevice: Device = {
                name: name.replace(/\.local$/, '')
                    .replace(/[^a-zA-Z0-9 ]/g, ''),
                origName: name,
                host: this.config.host || this.config.ip,
                port: this.config.port || 23,
                source: 'pluginConfig',
                fqdn: this.config.host || this.config.ip,
            };

            this.devicesFound.push(addDevice);
        }


        if (this.devicesFound.length > 0) {
            this.log.debug('Using manually configured device:', this.devicesFound);
        }else{

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
                            fqdn: dDevice.fqdn,
                            minVolume: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase(),
                            )?.minVolume || undefined,
                            maxVolume: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase(),
                            )?.maxVolume || undefined,
                            inputSwitches: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase(),
                            )?.inputSwitches || [],
                            listeningMode: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase(),
                            )?.listeningMode || undefined,
                            listeningModeFallback: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase(),
                            )?.listeningModeFallback || undefined,
                            listeningModeOther: this.config.discoveredDevices?.find(
                                (device: any) => device.host.toLowerCase() === dDevice.host.toLowerCase(),
                            )?.listeningModeOther || undefined,
                        });
                    }
                    this.log.debug('Discovered devices:', this.devicesFound);
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
                    'No devices found after maximum retry attempts. Please configure manually.',
                );

                addExitHandler(() => {
                    this.cleanCachedAccessories();
                }, this);

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
        inputs?: { id: string; name: string; type: number }[],

    ): void {
        // Cache inputs if both host and inputs are provided
        if (host && inputs) {
            this.cachedReceivers.set(host, { inputs });
        }

        // this.log.debug('updateConfigSchema() called', host, inputs);

        if (foundDevicesin.length === 0) {
            return;
        }

        const foundDevices = JSON.parse(JSON.stringify(foundDevicesin));

        try {
            const schemaPath = path.resolve(__dirname, '../config.schema.json');

            if (!fs.existsSync(schemaPath)) {
                this.log.error(
                    `Config schema file not found at path: ${schemaPath}`,
                );
                return;
            }

            const rawSchema = fs.readFileSync(schemaPath, 'utf8');
            let schema;

            try {
                schema = JSON.parse(rawSchema);
            } catch (error) {
                this.log.debug('Failed to parse config.schema.json:', error);
                return;
            }

            if (!schema.schema?.properties) {
                this.log.debug(
                    'Schema properties are missing in config.schema.json.',
                );
                return;
            }

            if (!schema.schema.properties.devices) {
                schema.schema.properties.devices = {
                    type: 'array', // array
                    title: 'Devices',
                    description:
                        'Add multiple Pioneer AVR devices to your configuration.',
                    items: {
                        type: 'object',
                        title: 'Device Configuration',

                        properties: {},
                    },
                };
            }

            schema.schema.properties.devices.default = []; // Initialize as an empty array
            schema.schema.properties.devices.minItems = 0;

            const firstDevice = foundDevices[0];

            schema.schema.properties.devices.items.properties.port = {
                type: 'integer',
                title: 'Device Port',
                description: `Enter the port number for the device connection (e.g., 23 or 8102). To open the port, visit: http://${firstDevice.host || 'vsx-922.local'}/1000/port_number.asp`,
                placeholder: firstDevice.port || '23',
            };

            if (firstDevice.source !== 'bonjour' && firstDevice.port) {
                schema.schema.properties.devices.items.properties.port.default =
                    firstDevice.port;
            }

            schema.schema.properties.devices.items.properties.name = {
                type: 'string',
                title: 'Device Name',
                description: 'Enter the name of the device visible in HomeKit.',
                placeholder: String(firstDevice.name || 'VSX922').replace(
                    /[^a-zA-Z0-9]/g,
                    '',
                ),
            };

            if (firstDevice.source !== 'bonjour' && firstDevice.name) {
                schema.schema.properties.devices.items.properties.name.default =
                    firstDevice.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
            }

            schema.schema.properties.devices.items.properties.host = {
                type: 'string',
                title: 'Device IP Address',
                description:
                    'Enter the IP address or the DNS name of the device (e.g., VSX-922.local).',
                placeholder: firstDevice.host || '192.168.1.99',
            };

            if (firstDevice.source !== 'bonjour' && firstDevice.host) {
                schema.schema.properties.devices.items.properties.host.default =
                    firstDevice.host;
            }

            schema.schema.properties.devices.items.properties.minVolume = {
                type: 'integer',
                title: 'Minimum Volume',
                description:
                    'Set the minimum volume level (0-100). Overrides global setting.',
                minimum: 0,
                maximum: 100,
                placeholder: this.config.minVolume || 30,
            };

            if (firstDevice.source !== 'bonjour' && firstDevice.minVolume) {
                schema.schema.properties.devices.items.properties.minVolume.default =
                    parseInt(firstDevice.minVolume, 10);
            }

            schema.schema.properties.devices.items.properties.maxVolume = {
                type: 'integer',
                title: 'Maximum Volume Setting (Lightbulb)',
                description:
                    'Set the maximum volume level (0-100). Overrides global setting.',
                minimum: 0,
                maximum: 100,
                placeholder: this.config.maxVolume || 65,
            };

            if (firstDevice.source !== 'bonjour' && firstDevice.maxVolume) {
                schema.schema.properties.devices.items.properties.maxVolume.default =
                    parseInt(firstDevice.maxVolume, 10);
            }

            let bonjourCounter = 0;
            for (const foundDevice of foundDevices) {
                if (foundDevice.source === 'bonjour') {
                    bonjourCounter++;
                }
            }


            const allInputs = [...this.cachedReceivers.entries()].flatMap(([host, device]) =>
                (device.inputs || []).map((input) => ({
                    id: input.id,
                    name: input.name,
                    host,
                })),
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

            let newProperties: any = {};

            if (enums.length > 0) {
                // Add the 'toggleOffIfActive' field directly under schema.schema.properties
                // schema.schema.properties.toggleOffIfActive = {
                //     title: "Toggle Off If Already Active (For Exposed Input Switches)",
                //     type: "boolean",
                //     default: this.config.toggleOffIfActive ?? true,
                //     description: "If enabled, pressing an input switch that is already active will turn off the receiver. This allows a single button to toggle the receiver on and off, facilitating one-button control in HomeKit. If disabled, the receiver will remain on and simply reselect the current input."
                // };

                // Define the 'toggleOffIfActive' field
                const toggleOffIfActive = {
                    title: "Toggle Off If Already Active (For Exposed Input Switches)",
                    type: "boolean",
                    default: this.config.toggleOffIfActive ?? true,
                    description: "If enabled, pressing an input switch that is already active will turn off the receiver. This allows a single button to toggle the receiver on and off, facilitating one-button control in HomeKit. If disabled, the receiver will remain on and simply reselect the current input."
                };

                // Remove 'toggleOffIfActive' if it already exists to avoid duplication
                if (schema.schema.properties.toggleOffIfActive) {
                    delete schema.schema.properties.toggleOffIfActive;
                }

                // Reconstruct properties to insert 'toggleOffIfActive' before 'devices'
                newProperties = {};
                for (const key in schema.schema.properties) {
                    if (key === 'devices') {
                        newProperties['toggleOffIfActive'] = toggleOffIfActive;
                    }
                    newProperties[key] = schema.schema.properties[key];
                }
                schema.schema.properties = newProperties;
            }else{

              // remove the 'toggleOffIfActive' field if no enums are present
              if (schema.schema.properties.toggleOffIfActive) {
                  delete schema.schema.properties.toggleOffIfActive;
              }

            }


            // Define the 'toggleListeningMode' field
            const toggleListeningMode = {
                title: "Toggle Listening Mode",
                type: "boolean",
                default: this.config.toggleListeningMode ?? true,
                description: "If enabled, the HomeKit receiver will display a switch that allows you to toggle between two predefined listening modes. If disabled, the switch will not be available in HomeKit."
            };


            // Remove 'toggleListeningMode' if it already exists to avoid duplication
            if (schema.schema.properties.toggleListeningMode) {
                delete schema.schema.properties.toggleListeningMode;
            }

            // Reconstruct properties to insert 'toggleListeningMode' before 'devices'
            newProperties = {};
            for (const key in schema.schema.properties) {
                if (key === 'devices') {
                    newProperties['toggleListeningMode'] = toggleListeningMode;
                }
                newProperties[key] = schema.schema.properties[key];
            }
            schema.schema.properties = newProperties;


            // Define the 'toggleListeningModeLink' field
            const toggleListeningModeLink = {
                title: "Listening Mode Switch Display",
                type: "boolean",
                default: this.config.toggleListeningModeLink ?? true,
                description: "If enabled, the HomeKit receiver will display the listening mode toggle directly within its view when devices are bundled (default behavior). If disabled, the toggle will appear as a separate switch, independent of the bundling setting."
            };


            // Remove 'toggleListeningModeLink' if it already exists to avoid duplication
            if (schema.schema.properties.toggleListeningModeLink) {
                delete schema.schema.properties.toggleListeningModeLink;
            }

            // Reconstruct properties to insert 'toggleListeningModeLink' before 'devices'
            newProperties = {};
            for (const key in schema.schema.properties) {
                newProperties[key] = schema.schema.properties[key];
                if (key === 'toggleListeningMode') {
                    newProperties['toggleListeningModeLink'] = toggleListeningModeLink;
                }
            }
            schema.schema.properties = newProperties;





            if (bonjourCounter !== foundDevices.length) {
                schema.schema.properties.devices.items.properties.inputSwitches = {
                    type: 'array',
                    title: 'Input Switches to Expose',
                    description:
                        'Select up to 5 inputs to expose as switches in HomeKit.',
                    items: {
                        type: 'string',
                    },
                    uniqueItems: true,
                    maxItems: 5,
                    minItems: 0,
                    default: [],
                };

                if (enums.length > 0) {
                    // Set the enum and enumNames for inputSwitches
                    schema.schema.properties.devices.items.properties.inputSwitches.items.enum = enums;
                    schema.schema.properties.devices.items.properties.inputSwitches.items.enumNames = enumNames;

                } else {
                    // Remove the inputSwitches field if no enums are present
                    if (schema.schema.properties.devices.items.properties.inputSwitches) {
                        delete schema.schema.properties.devices.items.properties.inputSwitches;
                    }
                }
            } else if (schema.schema.properties.devices.items.properties.inputSwitches) {
                delete schema.schema.properties.devices.items.properties.inputSwitches;
            }


            if (bonjourCounter > 0) {
                schema.schema.properties.discoveredDevices = {
                    type: 'array',
                    title: 'Discovered Devices',
                    items: {
                        type: 'object',
                        properties: {
                            host: {
                                type: 'string',
                                title: 'Host (IP or DNS Name). Do not edit this value.',
                                readOnly: true,
                            },
                            maxVolume: {
                                type: 'integer',
                                title: 'Maximum Volume Setting (Lightbulb)',
                                description:
                                    'Set the maximum volume level (0-100). Overrides global setting.',
                                minimum: 0,
                                maximum: 100,
                            },
                            minVolume: {
                                type: 'integer',
                                title: 'Minimum Volume',
                                description:
                                    'Set the minimum volume level (0-100). Overrides global setting.',
                                minimum: 0,
                                maximum: 100,
                                placeholder: this.config.minVolume || 30,
                            },
                            listeningMode: {
                                title: 'Primary Listening Mode',
                                type: 'string',
                                placeholder: this.config.listeningMode || '0013',
                                description: 'The default listening mode when the switch in HomeKit is active. Default 0013 PRO LOGIC2 MOVIE',
                            },
                            listeningModeOther: {
                                title: 'Alternative Listening Mode',
                                type: 'string',
                                placeholder: this.config.listeningModeFallback || '0112',
                                description: 'The alternative listening mode that is toggled via HomeKit switch or the iOS Remote app. Default 0112 EXTENDED STEREO',
                            },
                            listeningModeFallback: {
                                title: 'Fallback Listening Mode',
                                type: 'string',
                                placeholder: this.config.listeningModeOther || '0101',
                                description: 'A backup listening mode used when the Primary Listening Mode is unavailable (e.g., due to input signal restrictions). This mode should be **different** from the Primary Listening Mode and should be chosen based on what is likely to be supported. Default 0101 ACTION\nAvailable modes can be found in the list at the bottom of this page.',
                            },
                            inputSwitches: {
                                type: 'array',
                                title: 'Input Switches to Expose',
                                description:
                                    'Select up to 5 inputs to expose as switches in HomeKit.',
                                items: {
                                    type: 'string',
                                },
                                uniqueItems: true,
                                maxItems: 5,
                                default: [],
                            },
                        },
                        required: ['host'],
                    },
                    default: [],
                };

                if (enums.length > 0) {
                    schema.schema.properties.discoveredDevices.items.properties.inputSwitches.items.enum =
                        enums;
                    schema.schema.properties.discoveredDevices.items.properties.inputSwitches.items.enumNames =
                        enumNames;
                } else if (schema.schema.properties.discoveredDevices?.items.properties.inputSwitches) {
                    delete schema.schema.properties.discoveredDevices.items.properties.inputSwitches;
                }
            } else if (schema.schema.properties.discoveredDevices?.items.properties.inputSwitches) {
                delete schema.schema.properties.discoveredDevices.items.properties.inputSwitches;
            }

            for (const foundDevice of foundDevices) {
                const cachedInputs =
                    this.cachedReceivers.get(foundDevice.host)?.inputs || [];
                const deviceInputs =
                    inputs && host && foundDevice.host && host.toLowerCase() === foundDevice.host.toLowerCase() ? inputs : cachedInputs;

                let existingConfigInputSwitches =
                    this.config.discoveredDevices?.find(
                        (device: any) => device.host.toLowerCase() === foundDevice.host.toLowerCase(),
                    )?.inputSwitches || []; //inputSwitches.slice(0, 3);

                // Validate inputSwitches only if deviceInputs is not empty
                if (deviceInputs.length > 0) {
                    const validInputIds = deviceInputs.map((input) => input.id);

                    // Filter out invalid switches
                    existingConfigInputSwitches = existingConfigInputSwitches.filter((switchId) =>
                        validInputIds.includes(switchId),
                    );
                }

                const addDevice: {
                    name: any;
                    host: any;
                    port: any;
                    listeningMode: any;
                    listeningModeOther: any;
                    listeningModeFallback: any;
                    maxVolume?: any;
                    minVolume?: any;
                    inputSwitches?: string[];
                } = {
                    name: foundDevice.name,
                    host: foundDevice.host,
                    port: foundDevice.port,
                    listeningMode: foundDevice.listeningMode || '0013',
                    listeningModeOther: foundDevice.listeningModeOther || '0012',
                    listeningModeFallback: foundDevice.listeningModeFallback || '0101',
                    maxVolume: foundDevice.maxVolume
                        ? parseInt(foundDevice.maxVolume, 10)
                        : undefined,
                    minVolume: foundDevice.minVolume
                        ? parseInt(foundDevice.minVolume, 10)
                        : undefined,
                    inputSwitches: existingConfigInputSwitches,
                };

                foundDevice.inputSwitches = existingConfigInputSwitches;

                if (foundDevice.source === 'bonjour') {
                    schema.schema.properties.discoveredDevices.default.push(
                        addDevice,
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
                            ([key]) => key !== 'discoveredDevices',
                        ),
                    ),
                };
            }

            if (bonjourCounter > 0) {
                // If the property already exists, remove it first
                if (schema.schema.properties.maxReconnectAttemptsBeforeDiscover) {
                    delete schema.schema.properties.maxReconnectAttemptsBeforeDiscover;
                }

                // Create a new properties object to ensure ordering
                const newProperties = {};
                for (const key in schema.schema.properties) {
                    newProperties[key] = schema.schema.properties[key];
                    // After 'maxReconnectAttempts', insert our new property
                    if (key === "maxReconnectAttempts") {
                        newProperties["maxReconnectAttemptsBeforeDiscover"] = {
                            "title": "Maximum Reconnect Attempts Before Discovery",
                            "type": "integer",
                            "default": 10,
                            "minimum": 10,
                            "maximum": 100,
                            "description": "Set the maximum number of reconnect attempts before triggering a device rediscovery process."
                        };
                    }
                }
                // Assign the new properties object back to schema.schema.properties
                schema.schema.properties = newProperties;
            } else if (schema.schema.properties.maxReconnectAttemptsBeforeDiscover) {
                delete schema.schema.properties.maxReconnectAttemptsBeforeDiscover;
            }

            const dynamicHost = firstDevice.host || 'vsx-922.local';
            const dynamicHeaderLink = `To open a telnet port on the receiver or set Network Standby, click here: [http://${dynamicHost}/1000/port_number.asp](http://${dynamicHost}/1000/port_number.asp).`;

            if (!schema.headerDisplay) {
                schema.headerDisplay = `# Configuration\n\n${dynamicHeaderLink}`;
            } else {
                const regex =
                    /To open a telnet port on the receiver or set Network Standby, click here: \[http:\/\/.*?\/1000\/port_number\.asp\]\(http:\/\/.*?\/1000\/port_number\.asp\)\./;
                schema.headerDisplay = schema.headerDisplay
                    .replace(regex, '')
                    .trim();
                schema.headerDisplay += `\n\n${dynamicHeaderLink}`;
            }

            fs.writeFileSync(
                schemaPath,
                JSON.stringify(schema, null, 4),
                'utf8',
            );

            this.log.debug('Updated config.schema.json successfully.', schemaPath);


            if (schema.schema.properties.discoveredDevices && schema.schema.properties.discoveredDevices.default.length > 0) {

                try {
                    // Read the existing config.json
                    const rawConfig = fs.existsSync(this.homebridgeConfigPath) ? fs.readFileSync(this.homebridgeConfigPath, 'utf8') : '{}';
                    const config = JSON.parse(rawConfig);

                    if (Array.isArray(config.discoveredDevices)) {
                        delete config.discoveredDevices;
                    }

                    // get config for 'pioneerAvr2025' platform
                    let pioneerPlatform = config.platforms?.find(
                        (platform: any) => platform.name === this.platformName,
                    );

                    // Ensure the discoveredDevices array exists in the config.json
                    if (!Array.isArray(pioneerPlatform.discoveredDevices)) {
                        pioneerPlatform.discoveredDevices = [];
                    }

                    // Update discoveredDevices in config.json with the default values from schema
                    const discoveredDevicesFromSchema = schema.schema.properties.discoveredDevices.default;
                    const updatedDiscoveredDevices = discoveredDevicesFromSchema.map((device: { host: string }) => ({
                        host: device.host, // Include only host
                    }));

                    // Avoid duplicates by checking for existing devices in config.json
                    let writeConfig = false;
                    updatedDiscoveredDevices.forEach((newDevice) => {
                        if (!pioneerPlatform.discoveredDevices.some((device: { host: string }) => device.host.toLowerCase() === newDevice.host.toLowerCase())) {
                            pioneerPlatform.discoveredDevices.push(newDevice);
                            writeConfig = true;
                        }
                    });

                    // Write back the updated config.json
                    if (writeConfig && Object.keys(config).length > 1) {

                        function sortConfig(config: Record<string, any>): Record<string, any> {
                            const result: Record<string, any> = {};

                            const isPrimitive = (val: any): boolean =>
                                val === null || ["string", "number", "boolean"].includes(typeof val);

                            const reservedKeys = ["accessories", "platforms", "bridge", "disabledPlugins"];
                            const primitiveKeys: string[] = [];

                            // Utility: Sort object keys alphabetically with optional prioritized key first
                            const sortObjectKeys = (obj: Record<string, any>, prioritizeKey?: string): Record<string, any> => {
                                const sorted: Record<string, any> = {};
                                const keys = Object.keys(obj).sort();

                                if (prioritizeKey && keys.includes(prioritizeKey)) {
                                    sorted[prioritizeKey] = obj[prioritizeKey];
                                }

                                for (const key of keys) {
                                    if (key === prioritizeKey) continue;
                                    const value = obj[key];
                                    if (Array.isArray(value)) {
                                        sorted[key] = value.map((item) => {
                                            if (item && typeof item === 'object' && !Array.isArray(item)) {
                                                return sortObjectKeys(item);
                                            }
                                            return item;
                                        });
                                    } else if (value && typeof value === 'object') {
                                        sorted[key] = sortObjectKeys(value);
                                    } else {
                                        sorted[key] = value;
                                    }
                                }
                                return sorted;
                            };

                            // 1. accessories
                            if (Array.isArray(config.accessories)) {
                                result.accessories = [...config.accessories].sort((a, b) =>
                                    (a.name || "").localeCompare(b.name || "")
                                ).map(({ accessory, name, ...rest }) => {
                                    const sortedRest = sortObjectKeys(rest);
                                    return { accessory, name, ...sortedRest };
                                });
                            }

                            // 2. platforms
                            if (Array.isArray(config.platforms)) {
                                result.platforms = [...config.platforms].sort((a, b) => {
                                    const platformA = a.platform || "";
                                    const platformB = b.platform || "";

                                    if (platformA === "pioneerAvr2025") return -1;
                                    if (platformB === "pioneerAvr2025") return 1;
                                    if (platformA === "config") return 1;
                                    if (platformB === "config") return -1;

                                    return platformA.localeCompare(platformB);
                                }).map((platformObj) => {
                                    const { platform, name, _bridge, ...rest } = platformObj;

                                    const minMaxPairs: Record<string, string> = {};
                                    const otherKeys: string[] = [];

                                    const keys = Object.keys(rest);
                                    keys.forEach((key) => {
                                        if (key.startsWith("min")) {
                                            const maxKey = key.replace(/^min/, "max");
                                            if (keys.includes(maxKey)) {
                                                minMaxPairs[key] = maxKey;
                                            } else {
                                                otherKeys.push(key);
                                            }
                                        } else if (!Object.values(minMaxPairs).includes(key)) {
                                            otherKeys.push(key);
                                        }
                                    });

                                    const orderedKeys: string[] = [];
                                    for (const minKey of Object.keys(minMaxPairs).sort()) {
                                        orderedKeys.push(minKey, minMaxPairs[minMaxPairs[minKey]]);
                                    }

                                    otherKeys.sort();

                                    const sortedObj: Record<string, any> = { platform, name };
                                    for (const key of [...orderedKeys, ...otherKeys]) {
                                        let value = rest[key];

                                        // Special case: discoveredDevices
                                        if (key === "discoveredDevices" && Array.isArray(value)) {
                                            value = value
                                                .sort((a, b) => (a.host || "").localeCompare(b.host || ""))
                                                .map((device) => sortObjectKeys(device, "host"));
                                        } else if (Array.isArray(value)) {
                                            value = value.map((item) =>
                                                typeof item === "object" && item !== null && !Array.isArray(item)
                                                    ? sortObjectKeys(item)
                                                    : item
                                            );
                                        } else if (typeof value === "object" && value !== null) {
                                            value = sortObjectKeys(value);
                                        }

                                        sortedObj[key] = value;
                                    }

                                    if (_bridge) {
                                        sortedObj._bridge = sortObjectKeys(_bridge);
                                    }

                                    return sortedObj;
                                });
                            }

                            // 3. Other config keys (non-reserved)
                            for (const key of Object.keys(config)) {
                                if (reservedKeys.includes(key)) continue;

                                const value = config[key];
                                if (isPrimitive(value)) {
                                    primitiveKeys.push(key);
                                } else {
                                    result[key] = value;
                                }
                            }

                            // 4. bridge
                            if (config.bridge) {
                                result.bridge = config.bridge;
                            }

                            // 5. disabledPlugins
                            if (config.disabledPlugins) {
                                result.disabledPlugins = config.disabledPlugins;
                            }

                            // 6. primitives (like insecure: true)
                            for (const key of primitiveKeys.sort()) {
                                result[key] = config[key];
                            }

                            return result;
                        }






                        fs.writeFileSync(this.homebridgeConfigPath, JSON.stringify(sortConfig(config), null, 4), 'utf8');
                        this.log.debug('Successfully updated discoveredDevices in config.json.', this.homebridgeConfigPath);
                    }
                } catch (error) {
                    this.log.error('Failed to update config.json with discoveredDevices:', error);
                }
            }

        } catch (error) {
            this.log.error('Failed to update config.schema.json: ', error);
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
                let uniqueName = foundDevice.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '');
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
                    uniqueName !== foundDevice.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
                ) {
                    this.log.warn(
                        `Device with name '${foundDevice.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')}' already exists. Renaming to '${uniqueName}'.`,
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
                        'Restoring existing accessory from cache:',
                        existingAccessory.displayName,
                    );
                    new PioneerAvrAccessory(
                        foundDevice,
                        this,
                        existingAccessory,
                    );
                } else {
                    this.log.debug(
                        'Adding new accessory:',
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
                this.log.debug('Error processing device in loopDevices:', e);
            }
        }
    }
}
