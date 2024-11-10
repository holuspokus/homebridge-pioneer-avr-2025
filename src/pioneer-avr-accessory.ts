// src/pioneer-avr-accessory.ts

import PioneerAvr from './pioneer-avr/pioneerAvr';
import { Service, Logging, PlatformAccessory, CharacteristicValue } from 'homebridge';
import * as fs from 'fs';
import packageJson from "../package.json";
import { PioneerAvrPlatform } from './pioneer-avr-platform';

type Device = {
    name: string;
    ip: string;
    port: number;
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
    private maxVolumeSet: number;
    private prefsDir: string;
    private inputVisibilityFile: string;
    private savedVisibility: Record<string, any> = {};
    private log: Logging;
    public platform: PioneerAvrPlatform;
    public accessory: PlatformAccessory;
    private version: string;
    private functionSetLightbulbVolumeTimeout: NodeJS.Timeout | null = null;

    constructor(private device: Device, platform: PioneerAvrPlatform, accessory: PlatformAccessory) {
        this.device = device;
        this.platform = platform;
        this.accessory = accessory;
        this.log = this.platform.log;
        this.name = device.name || this.platform.config.name || 'Pioneer AVR';
        this.manufacturer = this.platform.config.manufacturer || 'Pioneer';
        this.model = this.platform.config.model || device.name || 'Unknown Model';
        this.host = device.ip || this.platform.config.host || '';
        this.maxVolumeSet = this.platform.config.maxVolumeSet || 100;
        this.prefsDir = this.platform.config.prefsDir || this.platform.api.user.storagePath() + "/pioneerAvr/";
        this.version = packageJson.version;

        this.name = this.name.replace(/[^a-zA-Z0-9]/g, "")

        this.log.debug('Creating accessory for', this.device);

        this.inputVisibilityFile = `${this.prefsDir}/inputsVisibility_${this.host}`;
        this.initializeVisibilityFile();

        try {
            this.avr = new PioneerAvr(platform, this, async (): Promise<void> => {
                try {
                    this.enabledServices = [];
                    await this.prepareInformationService();
                    await this.prepareTvService();
                    await this.prepareTvSpeakerService();

                    if (this.maxVolumeSet !== 0) {
                        await this.prepareVolumeService();
                    }

                    this.log.debug('> Finished initializing. Device ready!');
                } catch (err) {
                    this.log.debug("Error during AVR setup callback:", err);
                }
            });

            this.avr.addInputSourceService = this.addInputSourceService.bind(this);

        } catch (err) {
            this.log.debug("Error initializing AVR:", err);
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
                            this.log.error("Error creating the Input visibility file:", err);
                        } else {
                            this.log.debug("Input visibility file successfully created.");
                            this.loadSavedVisibility();
                        }
                    });
                } else {
                    this.log.debug("The Input visibility file already exists:", this.inputVisibilityFile);
                    this.loadSavedVisibility();
                }
            });
        } catch (err) {
            this.log.debug("Input visibility file could not be created:", err);
        }
    }

    private loadSavedVisibility() {
        try {
            const fileData = fs.readFileSync(this.inputVisibilityFile, 'utf-8');
            this.savedVisibility = JSON.parse(fileData);
        } catch (err) {
            this.log.debug("Input visibility file does not exist or JSON parsing failed:", err);
        }
    }

    /**
     * Prepares the accessory's information service.
     */
    private async prepareInformationService() {
        this.informationService = this.accessory.getService(this.platform.service.AccessoryInformation) ||
                                  this.accessory.addService(this.platform.service.AccessoryInformation);

        this.informationService
            .setCharacteristic(this.platform.characteristic.Name, this.name.replace(/[^a-zA-Z0-9]/g, ""))
            .setCharacteristic(this.platform.characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(this.platform.characteristic.Model, this.model)
            .setCharacteristic(this.platform.characteristic.SerialNumber, this.host)
            .setCharacteristic(this.platform.characteristic.FirmwareRevision, this.version);

        this.enabledServices.push(this.informationService);
    }

    /**
     * Sets up the Television service to control the AVR's power and input selection.
     */
    private async prepareTvService() {
        this.tvService = this.accessory.getService(this.platform.service.Television) ||
                         this.accessory.addService(this.platform.service.Television, this.name, 'tvService');

        this.tvService
            .setCharacteristic(this.platform.characteristic.ConfiguredName, this.name)
            .setCharacteristic(this.platform.characteristic.SleepDiscoveryMode, this.platform.characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(this.platform.characteristic.Active)
            .onGet(this.getPowerOn.bind(this))
            .onSet(this.setPowerOn.bind(this));

        this.tvService.getCharacteristic(this.platform.characteristic.ActiveIdentifier)
            .onGet(this.getActiveIdentifier.bind(this))
            .onSet(this.setActiveIdentifier.bind(this));

        this.tvService.getCharacteristic(this.platform.characteristic.RemoteKey)
            .onSet(this.remoteKeyPress.bind(this));

        this.enabledServices.push(this.tvService);

        this.avr.functionSetPowerState = (set: boolean) => {
            // console.log('functionSetPowerState called')
            if (this.tvService.getCharacteristic(this.platform.characteristic.Active).value !== set) {
                this.tvService.setCharacteristic(this.platform.characteristic.SleepDiscoveryMode, !set);
                this.tvService.setCharacteristic(this.platform.characteristic.Active, set);
            }
        };

        this.avr.functionSetActiveIdentifier = (set: number) => {
            // console.log('functionSetActiveIdentifier called')
            if (this.tvService.getCharacteristic(this.platform.characteristic.ActiveIdentifier).value !== set) {
                this.tvService.setCharacteristic(this.platform.characteristic.ActiveIdentifier, set);
            }
        };
    }

    /**
     * Prepares the Television Speaker service for volume control.
     */
    private async prepareTvSpeakerService() {
        this.tvSpeakerService = this.accessory.getService(this.platform.service.TelevisionSpeaker) ||
                                this.accessory.addService(this.platform.service.TelevisionSpeaker, this.name + " Speaker", "tvSpeakerService");

        this.tvSpeakerService
            .setCharacteristic(this.platform.characteristic.Active, this.platform.characteristic.Active.ACTIVE)
            .setCharacteristic(this.platform.characteristic.VolumeControlType, this.platform.characteristic.VolumeControlType.ABSOLUTE);

        this.tvSpeakerService.getCharacteristic(this.platform.characteristic.VolumeSelector)
            .onSet(this.setVolumeSwitch.bind(this));

        this.tvSpeakerService.getCharacteristic(this.platform.characteristic.Mute)
            .onGet(this.getMuted.bind(this))
            .onSet(this.setMuted.bind(this));

        this.tvSpeakerService.getCharacteristic(this.platform.characteristic.Volume)
            .onGet(this.getVolume.bind(this))
            .onSet(this.setVolume.bind(this));

        while(!this.tvService){
            await new Promise(resolve => setTimeout(resolve, 180));
        }

        this.tvService.addLinkedService(this.tvSpeakerService);
        this.enabledServices.push(this.tvSpeakerService);
    }

    /**
     * Prepares the Lightbulb service for volume control.
     */
    private async prepareVolumeService() {
        this.volumeServiceLightbulb = this.accessory.getService(this.platform.service.Lightbulb) ||
                                      this.accessory.addService(this.platform.service.Lightbulb, this.name + " VolumeBulb", 'volumeInput');

        this.volumeServiceLightbulb.getCharacteristic(this.platform.characteristic.On)
            .onGet(this.getMutedInverted.bind(this))
            .onSet(this.setMutedInverted.bind(this));

        this.volumeServiceLightbulb.getCharacteristic(this.platform.characteristic.Brightness)
            .onGet(this.getVolume.bind(this))
            .onSet(this.setVolume.bind(this));

        while(!this.tvService){
            await new Promise(resolve => setTimeout(resolve, 180));
        }

        this.tvService.addLinkedService(this.volumeServiceLightbulb);
        this.enabledServices.push(this.volumeServiceLightbulb);

        (this.avr as any).functionSetLightbulbVolume = (set: number) => {
            clearTimeout(this.functionSetLightbulbVolumeTimeout!);
            this.functionSetLightbulbVolumeTimeout = setTimeout(() => {
                try {
                    if (this.volumeServiceLightbulb.getCharacteristic(this.platform.characteristic.Brightness).value !== set) {
                        this.volumeServiceLightbulb.setCharacteristic(
                            this.platform.characteristic.Brightness,
                            ((this.avr as any).state.muted || !(this.avr as any).state.on) ? 0 : set
                        );
                    }

                    if (this.volumeServiceLightbulb.getCharacteristic(this.platform.characteristic.On).value !== !((this.avr as any).state.muted || !(this.avr as any).state.on)) {
                        this.volumeServiceLightbulb.setCharacteristic(
                            this.platform.characteristic.On,
                            ((this.avr as any).state.muted || !(this.avr as any).state.on) ? false : true
                        );
                    }
                } catch (e) {
                    this.log.debug('Error updating Lightbulb volume:', e);
                }
            }, 500);
        };

        (this.avr as any).functionSetLightbulbMuted = () => {
            try {
                this.volumeServiceLightbulb.getCharacteristic(this.platform.characteristic.On)
                    .updateValue(!((this.avr as any).state.muted || !(this.avr as any).state.on));
            } catch (e) {
                this.log.debug('Error updating Lightbulb mute state:', e);
            }
        };
    }

    /**
     * Prepares the input source service to allow selection of various AVR inputs.
     */
    private async addInputSourceService(error: any, key: any) {
        if(error){
          // console.log('in addInputSourceService ERROR> ' + String(error),  String(key))
          return
        }

        try {
            // console.log('in addInputSourceService> ' + String(key))
            const input = this.avr.inputs[key];
            const tmpInput = this.accessory.getServiceById(this.platform.service.InputSource, key.toString()) ||
                             this.accessory.addService(this.platform.service.InputSource, input.name.replace(/[^a-zA-Z0-9 ]/g, " "), key.toString());

            tmpInput
                .setCharacteristic(this.platform.characteristic.Identifier, key)
                .setCharacteristic(this.platform.characteristic.ConfiguredName, input.name.replace(/[^a-zA-Z0-9 ]/g, " "))
                .setCharacteristic(this.platform.characteristic.IsConfigured, this.platform.characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.platform.characteristic.InputSourceType, input.type)
                .setCharacteristic(this.platform.characteristic.CurrentVisibilityState, this.savedVisibility[input.id] || this.platform.characteristic.CurrentVisibilityState.SHOWN);

            tmpInput.getCharacteristic(this.platform.characteristic.TargetVisibilityState)
                .onSet((state) => {
                    tmpInput.setCharacteristic(this.platform.characteristic.CurrentVisibilityState, state);
                    this.savedVisibility[input.id] = state;
                    fs.writeFileSync(this.inputVisibilityFile, JSON.stringify(this.savedVisibility));
                });

            tmpInput.getCharacteristic(this.platform.characteristic.ConfiguredName)
                .onSet((name) => {
                    (this.avr as any).renameInput(input.id, name);
                });

            while(!this.tvService){
                await new Promise(resolve => setTimeout(resolve, 180));
            }

            // console.log('add input to homebridge', key)
            this.tvService.addLinkedService(tmpInput);
            this.enabledServices.push(tmpInput);

        } catch (e) {
            console.error('Error addInputSourceService:', e);
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
        if (!(this.avr as any).connectionReady) {
            return false;
        }
        return new Promise((resolve) => {
            (this.avr as any).powerStatus((error, status) => {
                if (error) {
                    this.log.error("Error getting power status:", error);
                    resolve(false);
                } else {
                    resolve(status);
                }
            });
        });
    }

    // Method to set the power status
    private async setPowerOn(on: CharacteristicValue): Promise<void> {
        if (!(this.avr as any).connectionReady) {
            return;
        }
        if (on) {
            (this.avr as any).powerOn();
        } else {
            (this.avr as any).powerOff();
        }
    }

    private async getActiveIdentifier(): Promise<CharacteristicValue> {
        return new Promise((resolve) => {
            (this.avr as any).inputStatus((_error, status) => {
                resolve(status || 0);
            });
        });
    }

    private async setActiveIdentifier(newValue: CharacteristicValue): Promise<void> {
        if (typeof newValue === 'number' && (this.avr as any).connectionReady) {
            (this.avr as any).setInput((this.avr as any).inputs[newValue].id);
        }
    }

    private async setVolumeSwitch(state: CharacteristicValue): Promise<void> {
        if (state === 1) {
            (this.avr as any).volumeUp();
        } else {
            (this.avr as any).volumeDown();
        }
    }

    private async getVolume(): Promise<CharacteristicValue> {
        return new Promise((resolve) => {
            (this.avr as any).volumeStatus((_error, volume) => {
                resolve(volume || 0);
            });
        });
    }

    private async setVolume(volume: CharacteristicValue): Promise<void> {
        if (typeof volume === 'number') {
            (this.avr as any).setVolume(volume);
        }
    }

    private async getMuted(): Promise<CharacteristicValue> {
        return new Promise((resolve) => {
            (this.avr as any).muteStatus((_error, isMuted) => {
                resolve(isMuted || false);
            });
        });
    }

    private async setMuted(mute: CharacteristicValue): Promise<void> {
        if (mute) {
            (this.avr as any).muteOn();
        } else {
            (this.avr as any).muteOff();
        }
    }

    private async getMutedInverted(): Promise<CharacteristicValue> {
        return !(this.avr as any).state.muted;
    }

    private async setMutedInverted(mute: CharacteristicValue): Promise<void> {
        if (!mute) {
            (this.avr as any).muteOn();
        } else {
            (this.avr as any).muteOff();
        }
    }

    private async remoteKeyPress(remoteKey: CharacteristicValue): Promise<void> {
        switch (remoteKey) {
            case this.platform.characteristic.RemoteKey.ARROW_UP:
                (this.avr as any).remoteKey("UP");
                break;
            case this.platform.characteristic.RemoteKey.ARROW_DOWN:
                (this.avr as any).remoteKey("DOWN");
                break;
            case this.platform.characteristic.RemoteKey.ARROW_LEFT:
                (this.avr as any).remoteKey("LEFT");
                break;
            case this.platform.characteristic.RemoteKey.ARROW_RIGHT:
                (this.avr as any).remoteKey("RIGHT");
                break;
            case this.platform.characteristic.RemoteKey.SELECT:
                (this.avr as any).remoteKey("ENTER");
                break;
            case this.platform.characteristic.RemoteKey.BACK:
                (this.avr as any).remoteKey("RETURN");
                break;
            case this.platform.characteristic.RemoteKey.PLAY_PAUSE:
                (this.avr as any).toggleListeningMode();
                break;
            case this.platform.characteristic.RemoteKey.INFORMATION:
                (this.avr as any).remoteKey("HOME_MENU");
                break;
            default:
                break;
        }
    }
}

export default PioneerAvrAccessory;
