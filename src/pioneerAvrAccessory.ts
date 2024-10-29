// pioneerAvrAccessory.ts
import { Service } from 'homebridge'; // Importiere die nötigen Typen von homebridge
import { PioneerAvr } from './pioneerAvr'; // Importiere die PioneerAvr-Klasse
import { Logging } from 'homebridge'; // Importiere den Logging-Typ (falls nötig)

import packageJson from "../package.json"; // Importiere die package.json

// const PLUGIN_NAME = packageJson.name; // Verwende den Namen aus package.json
const VERSION = packageJson.version; // Verwende die Version aus package.json


let functionSetLightbulbVolumeTimeout: NodeJS.Timeout | null = null;

class PioneerAvrAccessory {
    private informationService: Service;
    private tvService: Service;
    private volumeServiceLightbulb: Service;
    private tvSpeakerService: Service;
    private enabledServices: Service[] = [];
    private avr: PioneerAvr;
    private name: string;
    private manufacturer: string;
    private model: string;
    private host: string;
    private port: number; // Beispiel für eine neue Eigenschaft
    private maxVolumeSet: number; // Beispiel für eine neue Eigenschaft
    private minVolumeSet: number; // Beispiel für eine neue Eigenschaft
    private log: Logging; // Typ für log hinzufügen

    constructor(log: Logging, name: string, manufacturer: string, model: string, host: string, port: number, maxVolumeSet: number, minVolumeSet: number) {
        this.log = log;
        this.name = name;
        this.manufacturer = manufacturer;
        this.model = model;
        this.host = host;
        this.port = port; // Initialisiere hier
        this.maxVolumeSet = maxVolumeSet; // Initialisiere hier
        this.minVolumeSet = minVolumeSet; // Initialisiere hier

        this.initializeAvr();
    }

    private async initializeAvr() {
       try {
           this.avr = new PioneerAvr(
               this.log,
               this.host,
               this.port,
               this.maxVolumeSet,
               this.minVolumeSet,
               async () => {
                   try {
                       this.enabledServices = [];
                       await this.prepareInformationService();
                       await this.prepareTvService();
                       await this.prepareTvSpeakerService();
                       await this.prepareInputSourceService();

                       if (this.maxVolumeSet !== 0) {
                           await this.prepareVolumeService();
                       }

                   } catch (err) {
                       this.log.debug("new PioneerAvr() Callback-Error (%s)", err);
                   }
               }
           );

           await this.avr.initialize();
           this.log.debug("PioneerAvr() avr.initialize done");

       } catch (err) {
           this.log.debug("new PioneerAvr() Error (%s)", err);
       }
   }

  private async prepareInformationService() {
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Name, this.name.replace(/[^a-zA-Z0-9 ]/g, ""))
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer.replace(/[^a-zA-Z0-9 ]/g, ""))
      .setCharacteristic(Characteristic.Model, this.model.replace(/[^a-zA-Z0-9]/g, ""))
      .setCharacteristic(Characteristic.SerialNumber, this.host)
      .setCharacteristic(Characteristic.FirmwareRevision, VERSION) // Verwende die Version aus package.json
      .setCharacteristic(Characteristic.ConfiguredName, this.name.replace(/[^a-zA-Z0-9 ']/g, "")); // required for iOS18

    this.enabledServices.push(this.informationService);
  }

  private async prepareTvService() {
    this.tvService = new Service.Television(this.name.replace(/[^a-zA-Z0-9]/g, ""), "tvService");
    this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name.replace(/[^a-zA-Z0-9 ]/g, ""));
    this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // Set Active characteristic to power on or off AVR
    this.tvService.getCharacteristic(Characteristic.Active)
        .on("get", async (callback: Function) => {
            try {
                const value = await this.getPowerOn();
                callback(null, value); // Call the callback with the value
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        })
        .on("set", async (newValue: boolean, callback: Function) => {
            try {
                await this.setPowerOn(newValue);
                callback(); // Call the callback when done
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        });

    // ActiveIdentifier show and set current input on TV badge in HomeKit
    this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
        .on("get", async (callback: Function) => {
            try {
                const value = await this.getActiveIdentifier();
                callback(null, value); // Call the callback with the value
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        })
        .on("set", async (newValue: number, callback: Function) => {
            try {
                await this.setActiveIdentifier(newValue);
                callback(); // Call the callback when done
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        });

    // Remote Key
    this.tvService.getCharacteristic(Characteristic.RemoteKey)
        .on("set", (remoteKey: number, callback: Function) => {
            this.remoteKeyPress(remoteKey);
            callback(); // Call the callback immediately since this is synchronous
        });


    this.enabledServices.push(this.tvService);

    // Power State updates
    // Hier kannst du den Rest deiner Logik für die TV-Service-Initialisierung hinzufügen
  }


  private async prepareVolumeService() {
      // Volume

      this.volumeServiceLightbulb = new Service.Lightbulb(
          this.name.replace(/[^a-zA-Z0-9]/g, "") + " VolumeBulb",
          'volumeInput'
      );

      this.volumeServiceLightbulb
          .getCharacteristic(Characteristic.On)
          .on("get", async (callback: Function) => {
              try {
                  const value = await this.getMutedInverted();
                  callback(null, value); // Call the callback with the value
              } catch (error) {
                  callback(error); // Pass the error to the callback
              }
          })
          .on("set", async (newValue: boolean, callback: Function) => {
              try {
                  await this.setMutedInverted(newValue);
                  callback(); // Call the callback when done
              } catch (error) {
                  callback(error); // Pass the error to the callback
              }
          });

      this.volumeServiceLightbulb
          .getCharacteristic(Characteristic.Brightness)
          .on("get", async (callback: Function) => {
              try {
                  const value = await this.getVolume();
                  callback(null, value); // Call the callback with the value
              } catch (error) {
                  callback(error); // Pass the error to the callback
              }
          })
          .on("set", async (newValue: number, callback: Function) => {
              try {
                  await this.setVolume(newValue);
                  callback(); // Call the callback when done
              } catch (error) {
                  callback(error); // Pass the error to the callback
              }
          });


      this.volumeServiceLightbulb
          .getCharacteristic(Characteristic.On)
          .updateValue((this.avr.state.muted || !this.avr.state.on) ? false : true);

      this.volumeServiceLightbulb
          .getCharacteristic(Characteristic.Brightness)
          .updateValue(70);

      this.tvService.addLinkedService(this.volumeServiceLightbulb);
      this.enabledServices.push(this.volumeServiceLightbulb);

      this.avr.functionSetLightbulbVolume = (set: number) => {
          if (this.volumeServiceLightbulb.getCharacteristic(Characteristic.Brightness).value !== set) {
              clearTimeout(functionSetLightbulbVolumeTimeout);
              functionSetLightbulbVolumeTimeout = setTimeout(() => {
                  try {
                      this.volumeServiceLightbulb
                          .getCharacteristic(Characteristic.On)
                          .updateValue((this.avr.state.muted || !this.avr.state.on) ? false : true);

                      this.volumeServiceLightbulb
                          .getCharacteristic(Characteristic.Brightness)
                          .updateValue(set);
                  } catch (e) {
                      this.log.debug('updateValueVol', e);
                  }
              }, 50);
          }
      };

      let volumeServiceLightbulbTimeout: NodeJS.Timeout | null = null;
      this.avr.functionSetLightbulbMuted = (set: boolean) => {
          const chk = volumeServiceLightbulbTimeout === null;
          const timeoutTime = chk ? 0 : 500;

          clearTimeout(volumeServiceLightbulbTimeout);
          volumeServiceLightbulbTimeout = setTimeout(() => {
              try {
                  this.volumeServiceLightbulb
                      .getCharacteristic(Characteristic.On)
                      .updateValue(!(this.avr.state.muted || !this.avr.state.on));
              } catch (e) {
                  this.log.debug('functionSetLightbulbMuted Error', e);
              }
              volumeServiceLightbulbTimeout = null;
          }, timeoutTime);

          if (chk) {
              volumeServiceLightbulbTimeout = setTimeout(() => {
                  volumeServiceLightbulbTimeout = null;
              }, 500);
          }
      };
  }


  private async prepareTvSpeakerService() {
    this.tvSpeakerService = new Service.TelevisionSpeaker(this.name.replace(/[^a-zA-Z0-9]/g, "") + " Volume", "tvSpeakerService");
    this.tvSpeakerService.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE).setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector).on("set", (state, callback) => {
      this.log.debug("Volume change over the remote control (VolumeSelector), pressed: %s", state === 1 ? "Down" : "Up");
      this.setVolumeSwitch(state, callback, !state);
    });
    this.tvSpeakerService
        .getCharacteristic(Characteristic.Mute)
        .on("get", async (callback: Function) => {
            try {
                const value = await this.getMuted();
                callback(null, value); // Call the callback with the value
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        })
        .on("set", async (newValue: boolean, callback: Function) => {
            try {
                await this.setMuted(newValue);
                callback(); // Call the callback when done
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        });

    this.tvSpeakerService
        .addCharacteristic(Characteristic.Volume)
        .on("get", async (callback: Function) => {
            try {
                const value = await this.getVolume();
                callback(null, value); // Call the callback with the value
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        })
        .on("set", async (newValue: number, callback: Function) => {
            try {
                await this.setVolume(newValue);
                callback(); // Call the callback when done
            } catch (error) {
                callback(error); // Pass the error to the callback
            }
        });


    this.tvService.addLinkedService(this.tvSpeakerService);
    this.enabledServices.push(this.tvSpeakerService);
  }

  private async prepareInputSourceService() {
    this.log.info("Discovering inputs");
    this.avr.loadInputs((key) => {
      if (String(key).startsWith('E')) { return; }
      this.addInputSourceService(key);
    });
  }

  private async addInputSourceService(inputkey) {
    let key = parseInt(inputkey, 10);
    if (typeof this.avr.inputs[key] === "undefined") {
      this.log.error("addInputSourceService key undefined %s (input: %s)", key, inputkey);
      return;
    }
    let me = this;
    this.log.info("Add input n°%s - Name: %s Id: %s Type: %s", key, this.avr.inputs[key].name, this.avr.inputs[key].id, this.avr.inputs[key].type);

    let tmpInput = new Service.InputSource(this.avr.inputs[key].name.replace(/[^a-zA-Z0-9]/g, ""), "tvInputService" + String(key));
    tmpInput
      .setCharacteristic(Characteristic.Identifier, key)
      .setCharacteristic(Characteristic.ConfiguredName, this.avr.inputs[key].name.replace(/[^a-zA-Z0-9 ]/g, ""))
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.InputSourceType, this.avr.inputs[key].type)
      .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
      .setCharacteristic(Characteristic.TargetVisibilityState, Characteristic.TargetVisibilityState.SHOWN);

    tmpInput.getCharacteristic(Characteristic.TargetVisibilityState).on("set", (state, callback) => {
      me.log.debug("Set %s TargetVisibilityState %s", me.avr.inputs[key].name, state);
      tmpInput.setCharacteristic(Characteristic.CurrentVisibilityState, state);
      callback();
    });

    this.tvService.addLinkedService(tmpInput);
    this.enabledServices.push(tmpInput);
  }

  // Callback methods
  private async getPowerOn(callback) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady) {
      callback(null, false);
      return;
    }
    this.log.info("Get power status");
    this.avr.powerStatus(callback);
  }

  private async setPowerOn(on, callback) {
    if (on) {
      this.log.info("Power on");
      this.avr.powerOn();
    } else {
      this.log.info("Power off");
      this.avr.powerOff();
    }
    callback();
  }

  private async getActiveIdentifier(callback) {
    this.log.info("Get input status");
    this.avr.inputStatus(callback);
  }

  private lastInputSet: number | null = null;
  private lastsetActiveIdentifierTimeout: NodeJS.Timeout | null = null;
  private lastsetActiveIdentifierTime: number | undefined;

  private async setActiveIdentifier(newValue: number, callback: Function) {
      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
          callback();
          return;
      }

      this.log.debug(
          "setActiveIdentifier called",
          String(this.lastInputSet) === String(newValue),
          String(this.lastInputSet),
          String(newValue),
      );

      if (this.avr.isReady && this.lastInputSet !== null && String(this.lastInputSet) === String(newValue)) {
          callback();
          return;
      }

      // Change input
      this.lastInputSet = newValue;
      if (this.lastsetActiveIdentifierTimeout) {
          clearTimeout(this.lastsetActiveIdentifierTimeout);
      }

      let timeoutTimer = 0;
      const minTimeElapsed = 6000;
      if (this.lastsetActiveIdentifierTime !== undefined && Date.now() - this.lastsetActiveIdentifierTime < minTimeElapsed) {
          timeoutTimer = minTimeElapsed - (Date.now() - this.lastsetActiveIdentifierTime);
      }

      this.lastsetActiveIdentifierTimeout = setTimeout(() => {
          if (newValue in Object.keys(this.avr.inputs)) {
              this.log.info(
                  "set active identifier %s:%s (%s)",
                  newValue,
                  this.avr.inputs[newValue].id,
                  this.avr.inputs[newValue].name,
              );
              this.avr.setInput(this.avr.inputs[newValue].id);
              this.lastInputSet = newValue;
          }
      }, timeoutTimer);

      callback();
      this.lastsetActiveIdentifierTime = Date.now();
  }


  private async setVolumeSwitch(state, callback, isUp) {
    if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
      callback();
      return;
    }
    if (isUp) {
      this.log.info("Volume up");
      this.avr.volumeUp();
    } else {
      this.log.info("Volume down");
      this.avr.volumeDown();
    }
    callback();
  }

  private async getMuted(callback: (error: any, muted?: boolean) => void) {
      if (typeof callback !== "function") {
          callback = () => {};
      }

      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
          callback(null, true);
          return;
      }

      // Get mute status
      this.log.info("Get mute status");
      this.avr.muteStatus(callback);
  }

  private async getMutedInverted(callback: (error: null | Error, value?: boolean) => void) {
      if (typeof callback !== "function") {
          callback = () => {};
      }

      // Get mute status
      callback(null, !(this.avr.state.muted || !this.avr.state.on));
  }

  private async setMuted(mute: boolean, callback: () => void) {
      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
          callback();
          return;
      }

      // Set mute on/off
      if (mute) {
          this.log.info("Mute on");
          this.avr.muteOn();
      } else {
          this.log.info("Mute off");
          this.avr.muteOff();
      }

      callback();
  }

  private async setMutedInverted(mute: boolean, callback: () => void) {
      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
          callback();
          return;
      }

      // Set mute on/off for home app icon
      if (!mute) {
          this.avr.muteOn();
      } else {
          this.avr.muteOff();
      }

      callback();
  }


  private async getVolume(callback: (error: Error | null, value?: number) => void) {
      // Get volume status
      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
          callback(null, 30); // Rückgabe des Standardwerts 30
          return;
      }

      this.log.info("Get volume status");
      this.avr.volumeStatus(callback);
  }


  private async setVolume(volume: number, callback: () => void) {
      // Set volume status
      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on || this.avr.state.volume === volume) {
          callback();
          return;
      }

      this.log.debug("Set volume to %s, isMuted: %s", volume, this.avr.state.muted);
      this.avr.setVolume(volume, callback);

      if (volume <= 0 && !this.avr.state.muted) {
          this.log.debug("Set mute by volume %s", volume);
          this.setMuted(true, () => {});
      } else if (volume > 0 && this.avr.state.muted) {
          this.log.debug("Set UNmute by volume %s", volume);
          this.setMuted(false, () => {});
      }
  }


  private async remoteKeyPress(remoteKey: string, callback: () => void) {
      this.log.info("Remote key pressed: %s", remoteKey);

      if (!this.avr || !this.avr.s || !this.avr.s.connectionReady || !this.avr.state.on) {
          callback();
          return;
      }

      switch (remoteKey) {
          case Characteristic.RemoteKey.REWIND:
              this.log.info("Rewind remote key not implemented");
              break;
          case Characteristic.RemoteKey.FAST_FORWARD:
              this.log.info("Fast forward remote key not implemented");
              break;
          case Characteristic.RemoteKey.NEXT_TRACK:
              this.log.info("Next track remote key not implemented");
              callback();
              break;
          case Characteristic.RemoteKey.PREVIOUS_TRACK:
              this.log.info("Previous track remote key not implemented");
              callback();
              break;
          case Characteristic.RemoteKey.ARROW_UP:
              this.avr.remoteKey("UP");
              callback();
              break;
          case Characteristic.RemoteKey.ARROW_DOWN:
              this.avr.remoteKey("DOWN");
              callback();
              break;
          case Characteristic.RemoteKey.ARROW_LEFT:
              this.avr.remoteKey("LEFT");
              callback();
              break;
          case Characteristic.RemoteKey.ARROW_RIGHT:
              this.avr.remoteKey("RIGHT");
              callback();
              break;
          case Characteristic.RemoteKey.SELECT:
              this.avr.remoteKey("ENTER");
              callback();
              break;
          case Characteristic.RemoteKey.BACK:
          case Characteristic.RemoteKey.EXIT:
              this.avr.remoteKey("RETURN");
              callback();
              break;
          case Characteristic.RemoteKey.PLAY_PAUSE:
              this.avr.toggleListeningMode(callback);
              break;
          case Characteristic.RemoteKey.INFORMATION:
              this.avr.remoteKey("HOME_MENU");
              callback();
              break;
          default:
              callback();
              break;
      }
  }

}



export default PioneerAvrAccessory;
