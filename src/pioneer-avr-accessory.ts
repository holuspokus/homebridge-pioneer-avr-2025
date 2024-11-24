// src/pioneer-avr-accessory.ts

import PioneerAvr from "./pioneer-avr/pioneerAvr";
import {
    Service,
    Logging,
    PlatformAccessory,
    CharacteristicValue,
} from "homebridge";
import * as fs from "fs";
import packageJson from "../package.json";
import { PioneerAvrPlatform } from "./pioneer-avr-platform";
import { addExitHandler } from "./exitHandler";

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

class PioneerAvrAccessory {
    private informationService!: Service;
    private tvService!: Service;
    private volumeServiceLightbulb!: Service;
    private tvSpeakerService!: Service;
    private enabledServices: Service[] = [];
    public avr!: PioneerAvr;
    private name: string;
    private manufacturer: string;
    private model: string;
    private host: string;
    private maxVolume: number;
    private prefsDir: string;
    private inputVisibilityFile: string;
    private savedVisibility: Record<string, any> = {};
    private log: Logging;
    public platform: PioneerAvrPlatform;
    public accessory: PlatformAccessory;
    private version: string;

    constructor(
        private device: Device,
        platform: PioneerAvrPlatform,
        accessory: PlatformAccessory,
    ) {
        this.device = device;
        this.platform = platform;
        this.accessory = accessory;
        this.log = this.platform.log;
        this.name = device.name || "Pioneer AVR";
        this.manufacturer = this.platform.config.manufacturer || "Pioneer";
        this.model =
            this.platform.config.model || device.name || "Unknown Model";
        this.host = device.host || this.platform.config.host || "";
        this.maxVolume = this.platform.config.maxVolume || 100;
        this.prefsDir =
            this.platform.config.prefsDir ||
            this.platform.api.user.storagePath() + "/pioneerAvr/";
        this.version = packageJson.version;

        this.name = this.name.replace(/[^a-zA-Z0-9 ']/g, "");
        this.name = this.name
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
            .trim();

        this.log.info(
            `Creating accessory ${this.name} for: ${this.device.origName} at ${this.device.host}:${this.device.port}`,
        );

        this.inputVisibilityFile =
            `${this.prefsDir}/inputsVisibility_${this.host}`.replace(
                /\/{2,}/g,
                "/",
            );
        this.initializeVisibilityFile();

        try {
            this.avr = new PioneerAvr(
                platform,
                this,
                async (): Promise<void> => {
                    try {
                        while (!this.avr) {
                            await new Promise((resolve) =>
                                setTimeout(resolve, 180),
                            );
                        }

                        this.enabledServices = [];
                        await this.prepareInformationService();
                        await this.prepareTvService();
                        await this.prepareTvSpeakerService();

                        if (this.maxVolume !== 0) {
                            await this.prepareVolumeService();
                        }

                        this.log.info(
                            `> Finished initializing. Device ${this.name} ready!`,
                        );
                    } catch (err) {
                        this.log.debug("Error during AVR setup callback:", err);
                    }
                },
            );

            this.avr.addInputSourceService =
                this.addInputSourceService.bind(this);
        } catch (err) {
            this.log.debug("Error initializing AVR:", err);
        }
    }

    public async handleInputSwitches() {
        if (this.device.inputSwitches && Array.isArray(this.device.inputSwitches) && this.device.inputSwitches.length > 0) {
            await this.addInputSwitch(this.device.host, this.device.inputSwitches);
        }
    }



    private initializeVisibilityFile() {
        try {
            if (!fs.existsSync(this.prefsDir)) {
                fs.mkdirSync(this.prefsDir, { recursive: true });
            }

            fs.access(this.inputVisibilityFile, fs.constants.F_OK, (err) => {
                if (err) {
                    fs.writeFile(this.inputVisibilityFile, "{}", (err) => {
                        if (err) {
                            this.log.error(
                                "Error creating the Input visibility file:",
                                err,
                            );
                        } else {
                            this.log.debug(
                                "Input visibility file successfully created.",
                            );
                            this.loadSavedVisibility();
                        }
                    });
                } else {
                    this.log.debug(
                        "The Input visibility file already exists:",
                        this.inputVisibilityFile,
                    );
                    this.loadSavedVisibility();
                }
            });
        } catch (err) {
            this.log.debug("Input visibility file could not be created:", err);
        }
    }

    private loadSavedVisibility() {
        try {
            const fileData = fs.readFileSync(this.inputVisibilityFile, "utf-8");
            this.savedVisibility = JSON.parse(fileData);
        } catch (err) {
            this.log.debug(
                "Input visibility file does not exist or JSON parsing failed:",
                err,
            );
        }
    }

    /**
     * Prepares the accessory's information service.
     */
    private async prepareInformationService() {
        this.informationService =
            this.accessory.getService(
                this.platform.service.AccessoryInformation,
            ) ||
            this.accessory.addService(
                this.platform.service.AccessoryInformation,
            );

        this.informationService
            .setCharacteristic(
                this.platform.characteristic.Name,
                this.device.name.replace(/[^a-zA-Z0-9 ]/g, ""),
            )
            .setCharacteristic(
                this.platform.characteristic.Manufacturer,
                this.manufacturer,
            )
            .setCharacteristic(this.platform.characteristic.Model, this.model)
            .setCharacteristic(
                this.platform.characteristic.SerialNumber,
                this.device.origName.replace(/[^a-zA-Z0-9 ]/g, ""),
            )
            .setCharacteristic(
                this.platform.characteristic.FirmwareRevision,
                this.version,
            );

        this.enabledServices.push(this.informationService);
    }

    /**
     * Sets up the Television service to control the AVR's power and input selection.
     */
    private async prepareTvService() {
        this.tvService =
            this.accessory.getService(this.platform.service.Television) ||
            this.accessory.addService(
                this.platform.service.Television,
                this.name,
                "tvService",
            );

        this.tvService
            .setCharacteristic(
                this.platform.characteristic.ConfiguredName,
                this.name,
            )
            .setCharacteristic(
                this.platform.characteristic.SleepDiscoveryMode,
                this.platform.characteristic.SleepDiscoveryMode
                    .ALWAYS_DISCOVERABLE,
            );

        addExitHandler(() => {
            this.tvService.updateCharacteristic(
                this.platform.characteristic.SleepDiscoveryMode,
                this.platform.characteristic.SleepDiscoveryMode
                    .NOT_DISCOVERABLE,
            );
        }, this);

        this.tvService
            .getCharacteristic(this.platform.characteristic.Active)
            .onGet(this.getPowerOn.bind(this))
            .onSet(this.setPowerOn.bind(this));

        this.tvService
            .getCharacteristic(this.platform.characteristic.ActiveIdentifier)
            .onGet(this.getActiveIdentifier.bind(this))
            .onSet(this.setActiveIdentifier.bind(this));

        this.tvService
            .getCharacteristic(this.platform.characteristic.RemoteKey)
            .onSet(this.remoteKeyPress.bind(this));

        this.enabledServices.push(this.tvService);

        this.avr.functionSetPowerState = (set: boolean) => {
            try {
                let boolToNum = set ? 1 : 0;
                // console.log('functionSetPowerState called', typeof(this.tvService.getCharacteristic(this.platform.characteristic.Active).value), this.tvService.getCharacteristic(this.platform.characteristic.Active).value, boolToNum)
                if (
                    this.tvService.getCharacteristic(
                        this.platform.characteristic.Active,
                    ).value !== boolToNum
                ) {
                    // console.log('functionSetPowerState SET', boolToNum)
                    this.tvService.updateCharacteristic(
                        this.platform.characteristic.SleepDiscoveryMode,
                        !boolToNum,
                    );
                    this.tvService.updateCharacteristic(
                        this.platform.characteristic.Active,
                        boolToNum,
                    );
                }
            } catch (e) {
                this.log.debug("Error functionSetPowerState:", e);
            }
        };

        this.avr.functionSetPowerState(this.avr.state.on);

        this.avr.functionSetActiveIdentifier = (set: number) => {
            // console.log('functionSetActiveIdentifier called', this.tvService.getCharacteristic(this.platform.characteristic.ActiveIdentifier).value, set)
            if (
                this.tvService.getCharacteristic(
                    this.platform.characteristic.ActiveIdentifier,
                ).value !== set
            ) {
                this.tvService.updateCharacteristic(
                    this.platform.characteristic.ActiveIdentifier,
                    set,
                );
            }
        };
    }

    /**
     * Prepares the Television Speaker service for volume control.
     */
    private async prepareTvSpeakerService() {
        while (
            !this.tvService ||
            !this.enabledServices.includes(this.tvService)
        ) {
            await new Promise((resolve) => setTimeout(resolve, 180));
        }

        this.tvSpeakerService =
            this.accessory.getService(
                this.platform.service.TelevisionSpeaker,
            ) ||
            this.accessory.addService(
                this.platform.service.TelevisionSpeaker,
                this.name + " Speaker",
                "tvSpeakerService",
            );

        this.tvSpeakerService
            .getCharacteristic(this.platform.characteristic.Active)
            .onGet(this.getMutedInverted.bind(this))
            .onSet(this.setMutedInverted.bind(this));

        this.tvSpeakerService
            // .setCharacteristic(this.platform.characteristic.Active, this.platform.characteristic.Active.ACTIVE)
            .setCharacteristic(
                this.platform.characteristic.VolumeControlType,
                this.platform.characteristic.VolumeControlType.RELATIVE,
            );
        // .setCharacteristic(this.platform.characteristic.VolumeControlType, this.platform.characteristic.VolumeControlType.ABSOLUTE);

        this.tvSpeakerService
            .getCharacteristic(this.platform.characteristic.VolumeSelector)
            .onSet(this.setVolumeSwitch.bind(this));

        this.tvSpeakerService
            .getCharacteristic(this.platform.characteristic.Mute)
            .onGet(this.getMuted.bind(this))
            .onSet(this.setMuted.bind(this));

        this.tvSpeakerService
            .getCharacteristic(this.platform.characteristic.Volume)
            .onGet(this.getVolume.bind(this));

        // this.tvSpeakerService.getCharacteristic(this.platform.characteristic.Volume)
        //     .onGet(this.getVolume.bind(this))
        //     .onSet(this.setVolume.bind(this));

        this.tvService.addLinkedService(this.tvSpeakerService);
        this.enabledServices.push(this.tvSpeakerService);
        // this.log.debug('prepareTvSpeakerService enabled')
    }

    /**
     * Prepares the Lightbulb service for volume control.
     */
    private async prepareVolumeService() {
        while (
            !this.tvService ||
            !this.enabledServices.includes(this.tvService) ||
            !this.tvSpeakerService ||
            !this.enabledServices.includes(this.tvSpeakerService)
        ) {
            await new Promise((resolve) => setTimeout(resolve, 180));
        }

        this.volumeServiceLightbulb =
            this.accessory.getService(this.platform.service.Lightbulb) ||
            this.accessory.addService(
                this.platform.service.Lightbulb,
                this.name + " Volume",
                "volumeInput",
            );

        this.volumeServiceLightbulb
            .getCharacteristic(this.platform.characteristic.On)
            .onGet(this.getMutedInverted.bind(this))
            .onSet(this.setMutedInverted.bind(this));

        this.volumeServiceLightbulb
            .getCharacteristic(this.platform.characteristic.Brightness)
            .onGet(this.getVolume.bind(this))
            .onSet(this.setVolume.bind(this));

        this.tvService.addLinkedService(this.volumeServiceLightbulb);
        this.enabledServices.push(this.volumeServiceLightbulb);

        this.avr.functionSetLightbulbVolume = (set: number) => {
            try {
                const currentBrightness =
                    this.volumeServiceLightbulb.getCharacteristic(
                        this.platform.characteristic.Brightness,
                    ).value;
                const currentOnState =
                    this.volumeServiceLightbulb.getCharacteristic(
                        this.platform.characteristic.On,
                    ).value;

                // Update Brightness only if it is different from the new volume
                if (currentBrightness !== set) {
                    this.volumeServiceLightbulb.updateCharacteristic(
                        this.platform.characteristic.Brightness,
                        this.avr.state.muted || !this.avr.state.on ? 0 : set,
                    );
                }

                // Update On state based on mute and power status
                if (
                    currentOnState !==
                    !(this.avr.state.muted || !this.avr.state.on)
                ) {
                    this.volumeServiceLightbulb.updateCharacteristic(
                        this.platform.characteristic.On,
                        !(this.avr.state.muted || !this.avr.state.on),
                    );
                }
            } catch (e) {
                this.log.debug("Error updating Lightbulb volume:", e);
            }
        };

        // Initial volume setup only if volume state is valid
        if (typeof this.avr.state.volume === "number") {
            this.avr.functionSetLightbulbVolume(this.avr.state.volume);
        }

        this.avr.functionSetLightbulbMuted = () => {
            try {
                const currentOnState =
                    this.volumeServiceLightbulb.getCharacteristic(
                        this.platform.characteristic.On,
                    ).value;
                if (
                    currentOnState !==
                    !(this.avr.state.muted || !this.avr.state.on)
                ) {
                    this.volumeServiceLightbulb.updateCharacteristic(
                        this.platform.characteristic.On,
                        !(this.avr.state.muted || !this.avr.state.on),
                    );
                }
            } catch (e) {
                this.log.debug("Error updating Lightbulb mute state:", e);
            }
        };

        this.avr.functionSetLightbulbMuted(this.avr.state.muted);
    }

    /**
     * Prepares the input source service to allow selection of various AVR inputs.
     */
    private async addInputSourceService(error: any, key: any) {
        if (error) {
            // console.log('in addInputSourceService ERROR> ' + String(error),  String(key))
            return;
        }

        while (
            !this.tvService ||
            !this.enabledServices.includes(this.tvService)
        ) {
            await new Promise((resolve) => setTimeout(resolve, 180));
        }

        try {
            // console.log('in addInputSourceService> ' + String(key), this.avr.inputs)
            const input = this.avr.inputs[key];
            const tmpInput =
                this.accessory.getServiceById(
                    this.platform.service.InputSource,
                    key.toString(),
                ) ||
                this.accessory.addService(
                    this.platform.service.InputSource,
                    input.name.replace(/[^a-zA-Z0-9 ]/g, " "),
                    key.toString(),
                );

            tmpInput
                .setCharacteristic(this.platform.characteristic.Identifier, key)
                .setCharacteristic(
                    this.platform.characteristic.ConfiguredName,
                    input.name.replace(/[^a-zA-Z0-9 ]/g, " "),
                )
                .setCharacteristic(
                    this.platform.characteristic.IsConfigured,
                    this.platform.characteristic.IsConfigured.CONFIGURED,
                )
                .setCharacteristic(
                    this.platform.characteristic.InputSourceType,
                    input.type,
                )
                .setCharacteristic(
                    this.platform.characteristic.CurrentVisibilityState,
                    this.savedVisibility[input.id] ||
                        this.platform.characteristic.CurrentVisibilityState
                            .SHOWN,
                );

            tmpInput
                .getCharacteristic(
                    this.platform.characteristic.TargetVisibilityState,
                )
                .onSet((state) => {
                    setTimeout(() => {
                        try {
                            tmpInput.updateCharacteristic(
                                this.platform.characteristic
                                    .CurrentVisibilityState,
                                state,
                            );
                            this.savedVisibility[input.id] = state;
                            // this.log.debug('set visibility:', input.name, state)
                            fs.writeFile(
                                this.inputVisibilityFile,
                                JSON.stringify(this.savedVisibility),
                                () => {
                                    this.log.debug(
                                        "saved visibility:",
                                        input.name,
                                        state,
                                    );
                                },
                            );
                        } catch (error) {
                            this.log.error("set visibility Error", error);
                        }
                    }, 10);
                });

            tmpInput
                .getCharacteristic(this.platform.characteristic.ConfiguredName)
                .onSet((name) => {
                    this.avr.renameInput(input.id, String(name));
                });

            // console.log('add input to homebridge', key)
            this.tvService.addLinkedService(tmpInput);
            this.enabledServices.push(tmpInput);
        } catch (e) {
            console.error("Error addInputSourceService:", e);
        }
    }

    /**
     * Returns the enabled HomeKit services.
     */
    getServices() {
        return this.enabledServices;
    }

    // Method to get the power status as a CharacteristicValue
    private async getPowerOn(): Promise<CharacteristicValue> {
        if (!this.avr.telnetAvr.connectionReady) {
            return false;
        }
        return new Promise((resolve) => {
            this.avr.powerStatus((error, status) => {
                if (error) {
                    this.log.error("Error getting power status:", error);
                    resolve(false);
                } else {
                    resolve(status!);
                }
            });
        });
    }

    // Method to set the power status
    private async setPowerOn(on: CharacteristicValue): Promise<void> {
        if (!this.avr.telnetAvr.connectionReady) {
            return;
        }
        if (on) {
            this.avr.powerOn();
        } else {
            this.avr.powerOff();
        }
    }

    private async getActiveIdentifier(): Promise<CharacteristicValue> {
        return new Promise((resolve) => {
            this.avr.inputStatus((_error, status) => {
                resolve(status || 0);
            });
        });
    }

    private async setActiveIdentifier(
        newValue: CharacteristicValue,
    ): Promise<void> {
        // console.log('setActiveIdentifier called', newValue, typeof(newValue))
        if (
            typeof newValue === "number" &&
            this.avr.telnetAvr.connectionReady
        ) {
            this.log.debug(
                "set active identifier:",
                this.avr.inputs[newValue].name,
                this.avr.inputs[newValue].id,
            );
            this.avr.setInput(this.avr.inputs[newValue].id);
        }
    }

    private async setVolumeSwitch(state: CharacteristicValue): Promise<void> {
        this.log.debug("setVolumeSwitch called:", state);
        if (state !== 1) {
            this.avr.volumeUp();
        } else {
            this.avr.volumeDown();
        }
    }

    // private async setVolumeSwitch(direction: CharacteristicValue): Promise<void> {
    //     // Check if direction is actually a number
    //     if (typeof direction === 'number') {
    //         // direction = 1 (volume down), direction = 0 (volume up)
    //         const adjustment = direction === 0 ? 1 : -3;
    //         const currentVolume = await this.getVolume();
    //
    //         this.log.debug('setVolumeSwitch()currentVolume:', currentVolume)
    //
    //         // Ensure currentVolume is a number
    //         const newVolume = typeof currentVolume === 'number'
    //             ? Math.min(Math.max(currentVolume + adjustment, 0), 100)
    //             : 0;  // Set to 0 if currentVolume is not a valid value
    //
    //         await this.setVolume(newVolume);
    //         this.log.debug('setVolumeSwitch called, adjusting volume from %s%% to: %s%%', currentVolume, newVolume);
    //     } else {
    //         this.log.debug('setVolumeSwitch called with invalid direction:', direction);
    //     }
    // }

    private async getVolume(): Promise<number> {
        // Extract the return value from volume as a number or default to 0 if undefined
        return new Promise<number>((resolve) => {
            this.avr.volumeStatus((_error, volume) => {
                resolve(typeof volume === "number" ? volume : 0);
            });
        });
    }

    private async setVolume(volume: CharacteristicValue): Promise<void> {
        // Check if volume is a number before sending it to the device
        if (typeof volume === "number") {
            this.avr.setVolume(volume);
        } else {
            this.log.debug("setVolume called with invalid volume:", volume);
        }
    }

    private async getMuted(): Promise<CharacteristicValue> {
        if (!this.avr || this.avr.state.muted || !this.avr.state.on)
            return true;

        return new Promise((resolve) => {
            this.avr.muteStatus((_error, isMuted) => {
                resolve(isMuted || false);
            });
        });
    }

    private async setMuted(mute: CharacteristicValue): Promise<void> {
        if (mute) {
            this.avr.muteOn();
        } else {
            this.avr.muteOff();
        }
    }

    private async getMutedInverted(): Promise<CharacteristicValue> {
        return !(!this.avr || this.avr.state.muted || !this.avr.state.on);
    }

    private async setMutedInverted(mute: CharacteristicValue): Promise<void> {
        if (!mute) {
            this.avr.muteOn();
        } else {
            this.avr.muteOff();
        }
    }

    private async remoteKeyPress(
        remoteKey: CharacteristicValue,
    ): Promise<void> {
        switch (remoteKey) {
            case this.platform.characteristic.RemoteKey.ARROW_UP:
                this.avr.remoteKey("UP");
                break;
            case this.platform.characteristic.RemoteKey.ARROW_DOWN:
                this.avr.remoteKey("DOWN");
                break;
            case this.platform.characteristic.RemoteKey.ARROW_LEFT:
                this.avr.remoteKey("LEFT");
                break;
            case this.platform.characteristic.RemoteKey.ARROW_RIGHT:
                this.avr.remoteKey("RIGHT");
                break;
            case this.platform.characteristic.RemoteKey.SELECT:
                this.avr.remoteKey("ENTER");
                break;
            case this.platform.characteristic.RemoteKey.BACK:
                this.avr.remoteKey("RETURN");
                break;
            case this.platform.characteristic.RemoteKey.PLAY_PAUSE:
                this.avr.remoteKey("TOGGLE_PLAY_PAUSE");
                break;
            case this.platform.characteristic.RemoteKey.INFORMATION:
                this.avr.remoteKey("HOME_MENU");
                break;
            default:
                break;
        }
    }


    public addInputSwitch(host: string, inputSwitches: string[]): void {
        const cachedInputs = this.platform.cachedReceivers.get(host)?.inputs || [];
        if (cachedInputs.length === 0) {
            this.log.warn(`No cached inputs found for host: ${host}`);
            return;
        }

        const validAccessories: string[] = []; // Track valid accessory UUIDs

        inputSwitches.forEach((inputId) => {
            const input = cachedInputs.find((input) => input.id === inputId);

            if (!input) {
                this.log.warn(`Input ID ${inputId} not found for host: ${host}`);
                return;
            }

            let switchName = `${input.name} ${this.name}`;
            switchName = switchName.replace(/[^a-zA-Z0-9 ']/g, "");
            switchName = switchName
                .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "")
                .trim();

            this.log.debug(`Creating switch accessory: ${switchName} for host: ${host}`);

            const uuid = this.platform.api.hap.uuid.generate(`${host}-${inputId}`);
            validAccessories.push(uuid); // Mark this accessory as valid

            // Check if accessory already exists
            let accessory = this.platform.accessories.find(
                (existing) => existing.UUID === uuid
            );

            if (!accessory) {
                accessory = new this.platform.api.platformAccessory(switchName, uuid);
                accessory.context = {
                    host,
                    inputId: input.id,
                    inputName: input.name,
                };

                this.platform.accessories.push(accessory);
                this.platform.api.registerPlatformAccessories(
                    this.platform.pluginName,
                    this.platform.platformName,
                    [accessory]
                );
            }

            // Add or update Switch service
            const switchService =
                accessory.getService(this.platform.service.Switch) ||
                accessory.addService(
                    this.platform.service.Switch,
                    switchName,
                    input.id
                );

            const inputIndex = this.avr.inputs.findIndex(
                (findInput) => findInput.id === input.id
            );

            // Configure "On" characteristic
            switchService
                .getCharacteristic(this.platform.characteristic.On)
                .onGet(async () => {
                    const isOn = this.avr.state.on && inputIndex === this.avr.state.input;
                    return isOn;
                })
                .onSet(async (value) => {
                    if (value) {
                        // Turn on the receiver if it is off
                        if (!this.avr.state.on) {
                            await this.avr.powerOn();
                            this.log.info(`Receiver is powering on. Waiting...`);
                            await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
                        }

                        // Set the desired input
                        await this.avr.setInput(input.id);
                        this.log.debug(`Input set to ${input.name} (${input.id})`);
                    } else {
                        this.log.debug(`Switch for ${switchName} turned off.`);
                        // Wait before validating the state
                        await new Promise((resolve) => setTimeout(resolve, 10000));

                        // Check if the receiver is still on and the input matches
                        if (this.avr.state.on && this.avr.state.input === inputIndex) {
                            this.log.debug(
                                `Receiver is still on and input ${input.name} (${input.id}) is active. Re-enabling the switch.`
                            );

                            // Re-enable the switch since the input is still active
                            switchService
                                .getCharacteristic(this.platform.characteristic.On)
                                .updateValue(true);
                        }
                    }
                });

            this.log.info(
                `Switch accessory created for input: ${input.name} (${input.id}) on host: ${host}`
            );
        });

        // Cleanup invalid accessories
        const validAccessoryUUIDs = new Set(validAccessories);
        this.platform.accessories = this.platform.accessories.filter((accessory) => {
            const isValid = validAccessoryUUIDs.has(accessory.UUID);

            if (!isValid && accessory.context.host === host) {
                this.log.info(
                    `Removing accessory: ${accessory.displayName} (no longer valid)`
                );
                this.platform.api.unregisterPlatformAccessories(
                    this.platform.pluginName,
                    this.platform.platformName,
                    [accessory]
                );
            }

            return isValid || accessory.context.host !== host;
        });
    }


}

export default PioneerAvrAccessory;
