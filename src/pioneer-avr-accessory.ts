// src/pioneer-avr-accessory.ts

import PioneerAvr from './pioneer-avr/pioneerAvr';
import type {
    Service,
    Logging,
    PlatformAccessory,
    CharacteristicValue,
} from 'homebridge';
import fs from 'fs'; // For file system operations
import path from 'path'; // For handling file paths

import packageJson from '../package.json';
import type { PioneerAvrPlatform } from './pioneer-avr-platform';
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

class PioneerAvrAccessory {
    private informationService!: Service;
    public tvService!: Service;
    private volumeServiceLightbulb!: Service;
    private listeningServiceSwitch!: Service;
    private telnetConnectedServiceSwitch!: Service;
    private tvSpeakerService!: Service;
    public enabledServices: Service[] = [];
    public avr!: PioneerAvr;
    private name: string;
    private manufacturer: string;
    private model: string;
    private host: string;
    private maxVolume: number;
    private prefsDir: string;
    private inputCacheFile: string = '';
    private inputCache: Record<string, any> = {};
    private log: Logging;
    public platform: PioneerAvrPlatform;
    public accessory: PlatformAccessory;
    private version: string;
    private writeVisbilityTimeout: NodeJS.Timeout | null = null;
    private telnetConnectedServiceSwitchDisconnectTimeout: NodeJS.Timeout | null = null;

    private lastListeningSwitchPressTime: number = 0;
    private readonly LOCK_INTERVAL_LISTENING_SWITCH: number = 2000;
    // private timeoutFunctionSetSwitchListeningMode: NodeJS.Timeout | null = null;

    constructor(
        private device: Device,
        platform: PioneerAvrPlatform,
        accessory: PlatformAccessory,
    ) {
        this.device = device;
        this.platform = platform;
        this.accessory = accessory;
        this.log = this.platform.log;
        this.name = device.name || 'Pioneer AVR';
        this.manufacturer = this.platform.config.manufacturer || 'Pioneer';
        this.model =
            this.platform.config.model || device.name || 'Unknown Model';
        this.host = device.host || this.platform.config.host || '';
        this.maxVolume = this.platform.config.maxVolume || 100;
        this.prefsDir =
            this.platform.config.prefsDir ||
            this.platform.api.user.storagePath() + '/pioneerAvr/';
        this.inputCacheFile = path.join(
            this.prefsDir,
            `inputCache_${this.host}.json`,
        );

        this.version = packageJson.version;

        this.name = this.name.replace(/[^a-zA-Z0-9 ']/g, '');
        this.name = this.name
            .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
            .trim();

        this.log.info(
            `Creating accessory ${this.name} for: ${this.device.origName} at ${this.device.host}:${this.device.port}`,
        );


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

                        if (this.platform.config.toggleListeningMode ?? true) {
                            await this.prepareListeningService();
                        }

                        if (this.maxVolume !== 0) {
                            await this.prepareVolumeService();
                        }

                        if (this.platform.config.telnetSwitch ?? true) {
                            await this.prepareTelnetConnectedService();
                        }

                        this.log.info(
                            `> Finished initializing. Device ${this.name} ready!`,
                        );
                    } catch (err) {
                        this.log.debug('Error during AVR setup callback:', err);
                    }
                },
            );

            this.avr.addInputSourceService =
                this.addInputSourceService.bind(this);
        } catch (err) {
            this.log.debug('Error initializing AVR:', err);
        }

        // addExitHandler(() => {
        //     if (this.writeVisbilityTimeout) {
        //         clearTimeout(this.writeVisbilityTimeout);
        //     }
        // }, this);
    }

    public async handleInputSwitches() {
        if (this.device.inputSwitches && Array.isArray(this.device.inputSwitches) && this.device.inputSwitches.length > 0) {
            await this.addInputSwitch(this.device.host, this.device.inputSwitches);
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
                this.device.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
            )
            .setCharacteristic(
                this.platform.characteristic.Manufacturer,
                this.manufacturer,
            )
            .setCharacteristic(this.platform.characteristic.Model, this.model)
            .setCharacteristic(
                this.platform.characteristic.SerialNumber,
                this.device.origName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9\-\. '])/g, ''),
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
                'tvService',
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
                const boolToNum = set ? 1 : 0;
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
                this.log.debug('Error functionSetPowerState:', e);
            }
        };

        this.avr.functionSetPowerState(this.avr.state.on);

        this.avr.functionSetActiveIdentifier = (set: number) => {
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
                this.name + ' Speaker',
                'tvSpeakerService',
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
                this.name + ' Volume',
                'volumeInput',
            );

        this.volumeServiceLightbulb.addOptionalCharacteristic(this.platform.characteristic.ConfiguredName);
        this.volumeServiceLightbulb.setCharacteristic(this.platform.characteristic.Name, 'Volume');
        this.volumeServiceLightbulb.setCharacteristic(this.platform.characteristic.ConfiguredName, 'Volume');

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
                this.log.debug('Error updating Lightbulb volume:', e);
            }
        };

        // Initial volume setup only if volume state is valid
        if (typeof this.avr.state.volume === 'number') {
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
                this.log.debug('Error updating Lightbulb mute state:', e);
            }
        };

        this.avr.functionSetLightbulbMuted(this.avr.state.muted);
    }

    /**
    * Prepares the Switch service for check/control if telnet connected.
    */
    private timeoutFunctionSetSwitchTelnetConnected: NodeJS.Timeout | null = null;

    private async prepareTelnetConnectedService() {
        while (
           !this.tvService ||
           !this.enabledServices.includes(this.tvService)
        ) {
           await new Promise((resolve) => setTimeout(resolve, 180));
        }

        try {

          let switchName = `${this.name} telnet`;
          switchName = switchName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
              .trim();

          this.log.debug(`Creating switch accessory: ${switchName} for: ${this.name}`);

          const uuid = this.platform.api.hap.uuid.generate(`${this.host}-telnetState`);

          // Check if accessory already exists
          let accessory = this.platform.accessories.find(
              (existing) => existing.UUID === uuid,
          );

          if (!accessory) {
              accessory = new this.platform.api.platformAccessory(switchName, uuid);

              this.platform.accessories.push(accessory);
              this.platform.api.registerPlatformAccessories(
                  this.platform.pluginName,
                  this.platform.platformName,
                  [accessory],
              );
          }

          // Add or update Switch service
          this.telnetConnectedServiceSwitch =
              accessory.getServiceById(this.platform.service.Switch, this.name + 'telnetState') ||
              accessory.addService(
                this.platform.service.Switch,
                switchName,
                this.name + 'telnetState'
              );

          const informationService =
              accessory.getService(
                  this.platform.service.AccessoryInformation,
              ) ||
              accessory.addService(
                  this.platform.service.AccessoryInformation,
              );

          informationService
              .setCharacteristic(
                  this.platform.characteristic.Name,
                  switchName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
              )
              .setCharacteristic(
                  this.platform.characteristic.Manufacturer,
                  this.manufacturer,
              )
              .setCharacteristic(this.platform.characteristic.Model, this.model)
              .setCharacteristic(
                  this.platform.characteristic.SerialNumber,
                  `${this.name}-telnetState`.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9\-\. '])/g, ''),
              )
              .setCharacteristic(
                  this.platform.characteristic.FirmwareRevision,
                  this.version,
              );

            this.telnetConnectedServiceSwitch
              .getCharacteristic(this.platform.characteristic.On)
              .onGet(async () => {
                  return !!(this.avr?.telnetAvr?.connection?.socket?.connecting || this.avr?.telnetAvr?.connection?.socket?.readyState === 'open')
              })
              .onSet(async (value) => {
                  // this.log.debug('telnetConnectedServiceSwitch pressed:', value);
                  if (this.timeoutFunctionSetSwitchTelnetConnected) {
                      clearTimeout(this.timeoutFunctionSetSwitchTelnetConnected)
                  }

                  const currentState = !!(this.avr?.telnetAvr?.connection?.socket?.connecting || this.avr?.telnetAvr?.connection?.socket?.readyState === 'open');
                  if (!!value !== !!currentState) {
                      if (!!value) {
                          //connect?

                          if (this.telnetConnectedServiceSwitchDisconnectTimeout) {
                              clearTimeout(this.telnetConnectedServiceSwitchDisconnectTimeout);
                          }

                          if (this.avr?.telnetAvr?.connection && 'forcedDisconnect' in this.avr.telnetAvr.connection) {
                              this.avr.telnetAvr.connection.forcedDisconnect = false;
                          }

                          if (this.avr?.lastUserInteraction) {
                              this.avr.lastUserInteraction = Date.now();
                          }

                          if (this.avr?.telnetAvr?.connection?.connect) {
                              this.avr.telnetAvr.connection.connect();
                          }

                      } else {
                          //disconnect?

                          let timeoutToDisconnect = 4900;

                          if (this.avr?.state?.on) {
                              timeoutToDisconnect = ((5 * 60 * 1000) + 4900);
                          } else
                          if (this.avr?.lastUserInteraction) {
                              if ((((5 * 60 * 1000) + 4900) - (Date.now() - this.avr.lastUserInteraction)) > 5000) {
                                  timeoutToDisconnect = (((5 * 60 * 1000) + 4900) - (Date.now() - this.avr.lastUserInteraction));
                              }else {
                                  timeoutToDisconnect = 4900;
                              }

                              // this.log.debug('lastUserInteraction', Date.now(), this.avr.lastUserInteraction, (Date.now() - this.avr.lastUserInteraction) / 1000, ((Date.now() - this.avr.lastUserInteraction) < (62 * 1000)));

                              if ((Date.now() - this.avr.lastUserInteraction) < (62 * 1000)) {
                                  timeoutToDisconnect = 62 * 1000;
                              }
                          }

                          if (timeoutToDisconnect < 4900) {
                              timeoutToDisconnect = 4900;
                          }

                          if (this.telnetConnectedServiceSwitchDisconnectTimeout) {
                              clearTimeout(this.telnetConnectedServiceSwitchDisconnectTimeout);
                          }

                          if (timeoutToDisconnect < (60 * 1000) && this.avr?.telnetAvr?.connection && 'forcedDisconnect' in this.avr.telnetAvr.connection) {
                              this.avr.telnetAvr.connection.forcedDisconnect = true;
                          }

                          this.telnetConnectedServiceSwitchDisconnectTimeout = setTimeout(() => {
                              if (!this.avr?.state?.on && (this.avr?.telnetAvr?.connection?.socket?.readyState === 'open' || this.avr?.telnetAvr?.connection?.socket?.connecting) && (!this.avr?.lastUserInteraction ||
                              ((Date.now() - this.avr.lastUserInteraction) > (61 * 1000)))) {

                                  let runDisconnect = false;
                                  if (this.avr?.telnetAvr && 'connectionReady' in this.avr.telnetAvr) {
                                      if (this.avr?.telnetAvr?.connectionReady) {
                                          runDisconnect = true;
                                      }

                                      this.avr.telnetAvr.connectionReady = false;
                                  } else {
                                      runDisconnect = true;
                                  }

                                  if (runDisconnect) {
                                      if (this.avr?.telnetAvr?.connection && 'forcedDisconnect' in this.avr.telnetAvr.connection) {
                                          this.avr.telnetAvr.connection.forcedDisconnect = true;
                                      }


                                      if (this.avr?.telnetAvr?.connection?.messageQueue?.clearQueue) {
                                          this.avr.telnetAvr.connection.messageQueue.clearQueue();
                                      }

                                      if (this.avr?.telnetAvr?.connection?.disconnect) {
                                          setTimeout(() => {
                                              this.avr.telnetAvr.connection.disconnect();
                                          }, 100);
                                      }
                                  }
                              } else if (this.avr?.state?.on) {
                                  this.log.debug('the receiver is still on, no disconnect.');
                              }

                              if (this.timeoutFunctionSetSwitchTelnetConnected) {
                                  clearTimeout(this.timeoutFunctionSetSwitchTelnetConnected)
                              }

                              this.avr.functionSetSwitchTelnetConnected();
                          }, timeoutToDisconnect);
                          this.log.debug('time to disconnect ms:', timeoutToDisconnect);

                      }

                      if (this.timeoutFunctionSetSwitchTelnetConnected) {
                          clearTimeout(this.timeoutFunctionSetSwitchTelnetConnected)
                      }
                      this.timeoutFunctionSetSwitchTelnetConnected = setTimeout(() => {
                          this.avr.functionSetSwitchTelnetConnected();
                      }, 5000);
                  }
            });

            addExitHandler(() => {
               this.telnetConnectedServiceSwitch.updateCharacteristic(
                   this.platform.characteristic.On,
                   false,
               );
            }, this);


            this.enabledServices.push(this.telnetConnectedServiceSwitch);

            this.avr.functionSetSwitchTelnetConnected = () => {

               try {
                  const currentOnState =
                     this.telnetConnectedServiceSwitch.getCharacteristic(
                         this.platform.characteristic.On,
                     ).value;


                   // Update On state based on whether a listening mode is active
                   if ((this.avr?.telnetAvr?.connection?.socket?.readyState === 'open') !== currentOnState) {
                       this.telnetConnectedServiceSwitch.updateCharacteristic(
                           this.platform.characteristic.On,
                           !!(this.avr?.telnetAvr?.connection?.socket?.readyState === 'open'),
                       );
                   }
               } catch (e) {
                   this.log.debug('Error updating Switch listening mode:', e);
               }
            };

            // Initial listening mode setup
            this.avr.functionSetSwitchTelnetConnected();

            this.avr.telnetAvr.addOnDisconnectCallback(() => {
                this.avr.functionSetSwitchTelnetConnected();
            });

            this.avr.telnetAvr.addOnConnectCallback(async () => {
                this.avr.functionSetSwitchTelnetConnected();
            });

        } catch (error) {
           this.log.error('telnetConnectedServiceSwitchError:', error);
        }



    }


    /**
    * Prepares the Switch service for listening mode control.
    */
    private async prepareListeningService() {
        while (
           !this.tvService ||
           !this.enabledServices.includes(this.tvService)
        ) {
           await new Promise((resolve) => setTimeout(resolve, 180));
        }


        const isValidListeningMode = (value: string | undefined, defaultValue: string): string => {
            return /^[0-9]{4}$/.test(value || '') ? value! : defaultValue;
        };

        const listeningModeOne = isValidListeningMode(this.device.listeningMode || this.platform.config.listeningMode, '0013'); // PRO LOGIC2 MOVIE
        const listeningModeFallback = isValidListeningMode(this.device.listeningModeFallback || this.platform.config.listeningModeFallback, '0101'); // ACTION
        // const listeningModeOther = isValidListeningMode(this.device.listeningModeOther || this.platform.config.listeningModeOther, '0112'); // EXTENDED STEREO


        let switchName = `${this.name} Audio`;
        switchName = switchName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
            .trim();


        // Add or update Switch service
        if (this.platform.config.toggleListeningModeLink ?? true) {
            this.listeningServiceSwitch =
                this.accessory.getServiceById(this.platform.service.Switch, this.name + 'listeningMode') ||
                this.accessory.addService(
                  this.platform.service.Switch,
                  switchName,
                  this.name + 'listeningMode'
                );


            this.listeningServiceSwitch.addOptionalCharacteristic(this.platform.characteristic.ConfiguredName);
            this.listeningServiceSwitch.setCharacteristic(this.platform.characteristic.Name, 'listeningMode');
            this.listeningServiceSwitch.setCharacteristic(this.platform.characteristic.ConfiguredName, 'listeningMode');
        } else {
            const uuid = this.platform.api.hap.uuid.generate(`${this.host}-listeningMode`);

            // Check if accessory already exists
            let accessory = this.platform.accessories.find(
                (existing) => existing.UUID === uuid,
            );

            if (!accessory) {
                accessory = new this.platform.api.platformAccessory(switchName, uuid);

                this.platform.accessories.push(accessory);
                this.platform.api.registerPlatformAccessories(
                    this.platform.pluginName,
                    this.platform.platformName,
                    [accessory],
                );
            }

            this.listeningServiceSwitch =
                accessory.getServiceById(this.platform.service.Switch, this.name + 'listeningMode') ||
                accessory.addService(
                  this.platform.service.Switch,
                  switchName,
                  this.name + 'listeningMode'
                );


            const informationService =
                accessory.getService(
                    this.platform.service.AccessoryInformation,
                ) ||
                accessory.addService(
                    this.platform.service.AccessoryInformation,
                );

            informationService
                .setCharacteristic(
                    this.platform.characteristic.Name,
                    switchName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
                )
                .setCharacteristic(
                    this.platform.characteristic.Manufacturer,
                    this.manufacturer,
                )
                .setCharacteristic(this.platform.characteristic.Model, this.model)
                .setCharacteristic(
                    this.platform.characteristic.SerialNumber,
                    `${this.name}-listeningMode`.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9\-\. '])/g, ''),
                )
                .setCharacteristic(
                    this.platform.characteristic.FirmwareRevision,
                    this.version,
                );
        }

        this.listeningServiceSwitch
          .getCharacteristic(this.platform.characteristic.On)
          .onGet(async () => {
              let isOn = this?.avr?.state?.on && [listeningModeOne, listeningModeFallback].includes(this.avr.state.listeningMode || '');

              if (this?.avr?.state?.on && !this?.avr?.state?.listeningMode) {
                  isOn = true;
              }

              return isOn;
          })
          .onSet(async () => {
              const now = Date.now();
              const timeSinceLastPress = now - this.lastListeningSwitchPressTime;

              if (this?.avr?.state?.on && !this?.avr?.state?.listeningMode) {
                  return;
              }


              if (timeSinceLastPress < this.LOCK_INTERVAL_LISTENING_SWITCH) {
                  const remaining = this.LOCK_INTERVAL_LISTENING_SWITCH - timeSinceLastPress;
                  this.log.debug(
                  `Listening switch pressed too soon, ignoring press. ${remaining} ms remaining.`
                  );
                  // Reset the switch state to the actual current state
                  const currentState = this.avr.state.on &&
                      [listeningModeOne, listeningModeFallback].includes(this.avr.state.listeningMode || '');

                  this.listeningServiceSwitch
                      .getCharacteristic(this.platform.characteristic.On)
                      .updateValue(currentState);

                  return;
              }

              this.lastListeningSwitchPressTime = now;

              this.avr.toggleListeningMode();

        });

        addExitHandler(() => {
           this.listeningServiceSwitch.updateCharacteristic(
               this.platform.characteristic.On,
               false,
           );
        }, this);


        if (this.platform.config.toggleListeningModeLink ?? true) {
            this.tvService.addLinkedService(this.listeningServiceSwitch);
        }

        this.enabledServices.push(this.listeningServiceSwitch);

        this.avr.functionSetSwitchListeningMode = async () => {
            if (
                !this?.avr?.state?.on && (
                  !this.tvService ||
                  !this.enabledServices.includes(this.tvService) ||
                  !this?.avr?.isReady || !this?.avr?.state?.listeningMode
                )
            ) {
                this.listeningServiceSwitch.updateCharacteristic(
                    this.platform.characteristic.On,
                    false,
                );
                return;
            }

            if (this.avr.state.on && !this.avr.state.listeningMode) {
                await this?.avr?.__updateListeningMode?.(() => {});
            }

            try {
              const currentOnState =
                   this.listeningServiceSwitch.getCharacteristic(
                       this.platform.characteristic.On,
                   ).value;

               const isValidListeningMode = (value: string | undefined, defaultValue: string): string => {
                   return /^[0-9]{4}$/.test(value || '') ? value! : defaultValue;
               };

               const listeningModeOne = isValidListeningMode(this.device.listeningMode || this.platform.config.listeningMode, '0013'); // PRO LOGIC2 MOVIE
               const listeningModeFallback = isValidListeningMode(this.device.listeningModeFallback || this.platform.config.listeningModeFallback, '0101'); // ACTION
               // const listeningModeOther = isValidListeningMode(this.device.listeningModeOther || this.platform.config.listeningModeOther, '0112'); // EXTENDED STEREO

               const listeningModeActive = isValidListeningMode(this.avr.state.listeningMode || '', ''); // EXTENDED STEREO

               const currentState = this.avr.state.on && [listeningModeOne, listeningModeFallback].includes(listeningModeActive);

               // Update On state based on whether a listening mode is active
               if (!!currentOnState !== !!currentState) {
                   this.listeningServiceSwitch.updateCharacteristic(
                       this.platform.characteristic.On,
                       !!currentState,
                   );
               }
           } catch (e) {
               this.log.debug('Error updating Switch listening mode:', e);
           }
        };

    }


    /**
     * Prepares the input source service to allow selection of various AVR inputs.
     */
    private async addInputSourceService(error: any, key: any) {
        if (error) {
            return;
        }

        while (
            !this.tvService ||
            !this.enabledServices.includes(this.tvService)
        ) {
            await new Promise((resolve) => setTimeout(resolve, 180));
        }

        if (!(key in this.avr.inputs)) {
            this.log.error('addInputSourceService() input key not found.', key, this.avr.inputs);
            return;
        }


        try {
            const input = this.avr.inputs[key];
            const tmpInput =
                this.accessory.getServiceById(
                    this.platform.service.InputSource,
                    key.toString(),
                ) ||
                this.accessory.addService(
                    this.platform.service.InputSource,
                    input.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, ''),
                    key.toString(),
                );

            tmpInput
                .setCharacteristic(this.platform.characteristic.Identifier, key)
                .setCharacteristic(
                    this.platform.characteristic.ConfiguredName,
                    input.name.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, ''),
                )
                .setCharacteristic(
                    this.platform.characteristic.IsConfigured,
                    this.platform.characteristic.IsConfigured.CONFIGURED,
                )
                .setCharacteristic(
                    this.platform.characteristic.InputSourceType,
                    input.type ?? 0,
                )
                .setCharacteristic(
                    this.platform.characteristic.CurrentVisibilityState,
                    this.avr.booleanToVisibilityState(
                        input.visible ?? true,
                    ),
                );

            tmpInput
                .getCharacteristic(
                    this.platform.characteristic.TargetVisibilityState,
                )
                .onSet((state) => {

                    // const state = this.avr.booleanToVisibilityState(true); // 0
                    // const isVisible = this.avr.visibilityStateToBoolean(1); // false

                    this.avr.inputs[key].visible = this.avr.visibilityStateToBoolean(parseInt(String(state), 10));


                    setTimeout(() => {
                        tmpInput.updateCharacteristic(
                            this.platform.characteristic
                                .CurrentVisibilityState,
                            state,
                        );
                    }, key * 233);


                    if (this.writeVisbilityTimeout) {
                        clearTimeout(this.writeVisbilityTimeout);
                    }
                    this.writeVisbilityTimeout = setTimeout(() => {
                        try {


                            if (fs.existsSync(this.inputCacheFile)) {
                                this.inputCache = JSON.parse(
                                    fs.readFileSync(this.inputCacheFile, 'utf-8'),
                                );
                            }

                            if (!this.inputCache) {
                                this.inputCache = {};
                            }

                            this.inputCache.inputs = this.avr.inputs;

                            fs.writeFile(
                                this.inputCacheFile,
                                JSON.stringify(this.inputCache),
                                () => {
                                    this.log.debug(
                                        'saved visibility:',
                                    );
                                },
                            );
                        } catch (error) {
                            this.log.error('set visibility Error', error);
                        }
                    }, 15000);
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
        if (!this.avr.telnetAvr.connectionReady) {
            return false;
        }
        return new Promise((resolve) => {
            this.avr.powerStatus((error, status) => {
                if (error) {
                    this.log.error('Error getting power status:', error);
                    resolve(false);
                } else {
                    resolve(status!);
                }
            });
        });
    }

    // Method to set the power status
    private async setPowerOn(on: CharacteristicValue): Promise<void> {
        // if (!this.avr.telnetAvr.connectionReady) {
        //     return;
        // }
        if (on) {
            if (!this.avr?.state?.on) {
                this.avr.powerOn();
            }
        } else {
            if (this.avr?.state?.on) {
                this.avr.powerOff();
            }
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
            typeof newValue === 'number' &&
            this.avr.telnetAvr.connectionReady
        ) {
            this.log.debug(
                'set active identifier:',
                this.avr.inputs[newValue].name,
                this.avr.inputs[newValue].id,
            );
            this.avr.setInput(this.avr.inputs[newValue].id);
        }
    }

    private async setVolumeSwitch(state: CharacteristicValue): Promise<void> {
        this.log.debug('setVolumeSwitch called:', state);
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
                resolve(typeof volume === 'number' ? volume : 0);
            });
        });
    }

    private async setVolume(volume: CharacteristicValue): Promise<void> {
        // Check if volume is a number before sending it to the device
        if (typeof volume === 'number') {
            this.avr.setVolume(volume);
        } else {
            this.log.debug('setVolume called with invalid volume:', volume);
        }
    }

    private async getMuted(): Promise<CharacteristicValue> {
        if (!this.avr || this.avr.state.muted || !this.avr.state.on) {
            return true;
        }

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
                this.avr.remoteKey('UP');
                break;
            case this.platform.characteristic.RemoteKey.ARROW_DOWN:
                this.avr.remoteKey('DOWN');
                break;
            case this.platform.characteristic.RemoteKey.ARROW_LEFT:
                this.avr.remoteKey('LEFT');
                break;
            case this.platform.characteristic.RemoteKey.ARROW_RIGHT:
                this.avr.remoteKey('RIGHT');
                break;
            case this.platform.characteristic.RemoteKey.SELECT:
                this.avr.remoteKey('ENTER');
                break;
            case this.platform.characteristic.RemoteKey.BACK:
                this.avr.remoteKey('RETURN');
                break;
            case this.platform.characteristic.RemoteKey.PLAY_PAUSE:
                this.avr.remoteKey('TOGGLE_PLAY_PAUSE');
                break;
            case this.platform.characteristic.RemoteKey.INFORMATION:
                this.avr.remoteKey('HOME_MENU');
                break;
            default:
                break;
        }
    }


    public updateInputSwitchStates(activeInputId: string): void {
        // Iterate through all accessories
        this.platform.accessories.forEach((accessory) => {
            const service = accessory.getService(this.platform.service.Switch);

            // not listeningMode
            if (service && accessory?.context?.inputId) {
                // Check if the current accessory corresponds to the active input
                // only input switches have inputId
                const isActive = !!(this.avr?.state?.on && (accessory.context.inputId === activeInputId));

                // Update the switch state
                service.getCharacteristic(this.platform.characteristic.On).updateValue(isActive);
            }
        });

        // this.log.debug(`Switch states updated. Active input ID: ${activeInputId}`);
    }


    // Timestamp for the last input switch press
    // Lock interval in milliseconds for input switch commands
    private lastInputSwitchPressTime: number = 0;
    private timeoutupdateInputSwitchStates: NodeJS.Timeout | null = null;
    private readonly LOCK_INTERVAL_INPUT_SWITCH: number = 3000;

    public addInputSwitch(host: string, inputToSwitches: string[]): void {
        const cachedInputs = this.platform.cachedReceivers.get(host)?.inputs || [];
        if (cachedInputs.length === 0) {
            this.log.warn(`No cached inputs found for host: ${host}`);
            return;
        }

        const validAccessories: string[] = []; // Track valid accessory UUIDs

        inputToSwitches.slice(0, 5).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach((inputId) => {
            const input = cachedInputs.find((input) => input.id === inputId);

            if (!input) {
                this.log.warn(`Input ID ${inputId} not found for host: ${host}`);
                return;
            }

            let switchName = `${input.name} ${this.name}`;
            switchName = switchName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
                .trim();

            this.log.debug(`Creating switch accessory: ${switchName} for host: ${host}`);

            const uuid = this.platform.api.hap.uuid.generate(`${host}-${inputId}`);
            validAccessories.push(uuid); // Mark this accessory as valid

            // Check if accessory already exists
            let accessory = this.platform.accessories.find(
                (existing) => existing.UUID === uuid,
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
                    [accessory],
                );
            }

            // Add or update Switch service
            const switchService =
                accessory.getServiceById(this.platform.service.Switch, this.name + input.id) ||
                accessory.addService(this.platform.service.Switch, switchName, this.name + input.id);

            const inputIndex = this.avr.inputs.findIndex(
                (findInput) => findInput.id === input.id,
            );

            // switchService.setCharacteristic(
            //     this.platform.characteristic.SerialNumber,
            //     `${host}-${input.id}-${input.name}`.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9\-\. '])/g, ''),
            // )



            const informationService =
                accessory.getService(
                    this.platform.service.AccessoryInformation,
                ) ||
                accessory.addService(
                    this.platform.service.AccessoryInformation,
                );

            informationService
                .setCharacteristic(
                    this.platform.characteristic.Name,
                    switchName.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9 '])/g, '')
                )
                .setCharacteristic(
                    this.platform.characteristic.Manufacturer,
                    this.manufacturer,
                )
                .setCharacteristic(this.platform.characteristic.Model, this.model)
                .setCharacteristic(
                    this.platform.characteristic.SerialNumber,
                    `${host}-${input.id}-${input.name}`.replace(/(^[^a-zA-Z0-9]+)|([^a-zA-Z0-9]+$)|([^a-zA-Z0-9\-\. '])/g, ''),
                )
                .setCharacteristic(
                    this.platform.characteristic.FirmwareRevision,
                    this.version,
                );


            // Configure 'On' characteristic
            switchService
                .getCharacteristic(this.platform.characteristic.On)
                .onGet(async () => {
                    // Return true if the receiver is on and the input matches the switch index
                    const isOn = this.avr.state.on && inputIndex === this.avr.state.input;
                    return isOn;
                })
                .onSet(async (value) => {
                    const now = Date.now();
                    const timeSinceLastPress = now - this.lastInputSwitchPressTime;

                    // If the last command was executed less than the lock interval ago, discard the press
                    if (timeSinceLastPress < this.LOCK_INTERVAL_INPUT_SWITCH) {
                        const remaining = this.LOCK_INTERVAL_INPUT_SWITCH - timeSinceLastPress;
                        this.log.debug(`Pressed too soon, ignoring press. ${remaining} ms remaining.`);

                        // Reset the switch state to the current state so the UI reflects the actual state
                        const currentState = this.avr.state.on && inputIndex === this.avr.state.input;
                        switchService.getCharacteristic(this.platform.characteristic.On).updateValue(currentState);
                        return;
                    }

                  // Update the timestamp after waiting the necessary time
                  this.lastInputSwitchPressTime = Date.now();

                  if (this.timeoutupdateInputSwitchStates) {
                      clearTimeout(this.timeoutupdateInputSwitchStates)
                  }

                  if (this.platform.config.toggleOffIfActive ?? true) {
                        if (this.avr.state.on) {
                          if (this.avr.state.input === inputIndex) {
                            await this.avr.powerOff();
                            return;
                          }
                      } else {
                          await this.avr.powerOn();

                          let c = 1000;
                          while (
                              !this.avr.state.on && c-- > 0
                          ) {
                              await new Promise((resolve) => setTimeout(resolve, 1555)); // Wait
                          }
                          await new Promise((resolve) => setTimeout(resolve, 5000));
                      }

                      // Set the desired input
                      await this.avr.setInput(input.id);
                      this.log.debug(`Input set to ${input.name} (${input.id})`);

                      this.timeoutupdateInputSwitchStates = setTimeout(() => {
                          // Update all switch states
                          this.updateInputSwitchStates(input.id);
                      }, 2000)

                  } else if (value) {
                      // Turn on the receiver if it is off
                      if (!this.avr.state.on) {
                          await this.avr.powerOn();

                          let c = 1000;
                          while (
                              !this.avr.state.on && c-- > 0
                          ) {
                              await new Promise((resolve) => setTimeout(resolve, 1555)); // Wait
                          }
                          await new Promise((resolve) => setTimeout(resolve, 5000));
                      }

                      // Set the desired input
                      await this.avr.setInput(input.id);
                      this.log.debug(`Input set to ${input.name} (${input.id})`);


                      this.timeoutupdateInputSwitchStates = setTimeout(() => {
                          // Update all switch states
                          this.updateInputSwitchStates(input.id);
                      }, 2000)

                  } else {
                      this.log.debug(`Switch for ${switchName} turned off.`);
                      // Check if the receiver is still on and the input matches
                      if (this.avr.state.on && this.avr.state.input === inputIndex) {
                          await this.avr.powerOff();
                      }
                  }
              });


            addExitHandler(() => {
                this.updateInputSwitchStates('-9999');
            }, this);


            this.log.info(
                `${this.name}> Switch accessory created for input: ${input.name} (${input.id}) on host: ${host}`,
            );
        });

        // Cleanup invalid accessories
        const validAccessoryUUIDs = new Set(validAccessories);
        this.platform.accessories = this.platform.accessories.filter((accessory) => {
            const isValid = validAccessoryUUIDs.has(accessory.UUID);

            if (!isValid && accessory?.context?.host && host && accessory.context.host.toLowerCase() === host.toLowerCase()) {
                this.log.info(
                    `${this.name}> Removing accessory: ${accessory.displayName} (no longer valid)`,
                );
                this.platform.api.unregisterPlatformAccessories(
                    this.platform.pluginName,
                    this.platform.platformName,
                    [accessory],
                );
            }

            return isValid || accessory.context.host !== host;
        });
    }


}

export default PioneerAvrAccessory;
