// src/pioneer-avr/volume.ts

import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import { API, Logging, Service, Characteristic } from 'homebridge';


class VolumeManagementMethods extends PioneerAvr {
    private telnetAvr!: TelnetAvr;
    private changeVolBlocked = false;
    private blocktimer: NodeJS.Timeout | null = null;
    private updateVolumeTimeout: NodeJS.Timeout | null = null;
    private lastMuteStatus: number | null = null;

    constructor(api: API, log: Logging, host: string, port: number, maxVolumeSet: number, minVolumeSet: number, service: Service, characteristic: Characteristic, pioneerAvrClassCallback?: () => Promise<void>) {
        super(api, log, host, port, maxVolumeSet, minVolumeSet, service, characteristic, pioneerAvrClassCallback);

        // Handle disconnection
        this.telnetAvr.addOnDisconnectCallback(() => {
            try {
                if (this.functionSetLightbulbVolume && typeof this.functionSetLightbulbVolume === 'function') {
                    this.functionSetLightbulbVolume(this.state.volume);
                } else {
                    this.log.error("functionSetLightbulbVolume is not available");
                }
            } catch (e) {
                this.log.debug("functionSetLightbulbVolume", e);
            }
        });

        // Handle connection
        this.telnetAvr.addOnConnectCallback(async () => {
            try {
                this.functionSetLightbulbVolume(this.state.volume);
                this.__updateListeningMode(() => {});
                this.__updateVolume(() => {});
                this.__updateMute(() => {});
            } catch (e) {
                this.log.debug("functionSetLightbulbVolume", e);
            }
        });
    }

    // Set volume in lightbulb characteristic
    public functionSetLightbulbVolume(volume: number) {
        // Implement volume setting logic here
    }

    // Request volume update
    public __updateVolume = async function (callback: Function) {
        this.telnetAvr.sendMessage("?V", "VOL", callback);
    };

    // Request mute status update
    public __updateMute = async function (callback: Function) {
        this.telnetAvr.sendMessage("?M", "MUT", callback);
    };

    // Get volume status with a callback
    public volumeStatus = function (callback: (err: any, volume?: number) => void) {
        if (this.state.volume !== null) {
            callback(null, this.state.volume);
            return;
        }

        this.__updateVolume(() => {
            callback(null, this.state.volume);
        });
    };

    // Set a specific volume level
    public setVolume = function (targetVolume: number, callback: Function) {
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }

        targetVolume = parseInt(targetVolume.toString(), 10);

        if (isNaN(targetVolume) || Math.floor(targetVolume) === this.state.volume) {
            callback();
            return;
        }

        let vsxVol = 0;

        // Volume calculation based on min and max volume
        if (this.maxVolumeSet > 0) {
            const minVolumeIn185 = (this.minVolumeSet / 100) * 185;
            const maxVolumeIn185 = (this.maxVolumeSet / 100) * 185;
            vsxVol = ((targetVolume / 100) * (maxVolumeIn185 - minVolumeIn185)) + minVolumeIn185;
        } else {
            vsxVol = (targetVolume * 185) / 100; // Fallback
        }

        vsxVol = Math.floor(vsxVol);
        const vsxVolStr = vsxVol.toString().padStart(3, '0'); // Pad to 3 digits

        this.telnetAvr.sendMessage(`${vsxVolStr}VL`, undefined, callback);
        this.lastUserInteraction = Date.now();
    };

    // Increase volume level
    public volumeUp = function () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }
        this.log.debug("Volume up", !this.changeVolBlocked);

        clearTimeout(this.updateVolumeTimeout as NodeJS.Timeout);
        this.changeVolBlocked = true;

        this.blocktimer = setTimeout(() => {
            this.changeVolBlocked = false;
            clearTimeout(this.updateVolumeTimeout as NodeJS.Timeout);
            this.updateVolumeTimeout = setTimeout(() => {
                this.__updateVolume(() => {});
                this.__updateMute(() => {});
            }, 1000);
        }, 500);

        if (this.web) {
            fetch(`${this.webEventHandlerBaseUrl}VU`, { method: 'GET' }).then(() => {
                clearTimeout(this.blocktimer as NodeJS.Timeout);
                this.changeVolBlocked = false;
                this.updateVolumeTimeout = setTimeout(() => {
                    this.__updateVolume(() => {});
                    this.__updateMute(() => {});
                }, 1000);
            });
        } else {
            this.telnetAvr.sendMessage("VU", undefined, () => {
                clearTimeout(this.blocktimer as NodeJS.Timeout);
                this.changeVolBlocked = false;
                this.updateVolumeTimeout = setTimeout(() => {
                    this.__updateVolume(() => {});
                    this.__updateMute(() => {});
                }, 1000);
            });
        }
    };

    // Decrease volume level
    public volumeDown = function () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }
        this.log.debug("Volume down", !this.changeVolBlocked);

        clearTimeout(this.updateVolumeTimeout as NodeJS.Timeout);
        this.changeVolBlocked = true;

        this.blocktimer = setTimeout(() => {
            this.changeVolBlocked = false;
            clearTimeout(this.updateVolumeTimeout as NodeJS.Timeout);
            this.updateVolumeTimeout = setTimeout(() => {
                this.__updateVolume(() => {});
                this.__updateMute(() => {});
            }, 1000);
        }, 500);

        if (this.web) {
            fetch(`${this.webEventHandlerBaseUrl}VD`, { method: 'GET' }).then(() => {
                clearTimeout(this.blocktimer as NodeJS.Timeout);
                this.changeVolBlocked = false;
                this.updateVolumeTimeout = setTimeout(() => {
                    this.__updateVolume(() => {});
                    this.__updateMute(() => {});
                }, 1000);
            });
        } else {
            this.telnetAvr.sendMessage("VD", undefined, () => {
                clearTimeout(this.blocktimer as NodeJS.Timeout);
                this.changeVolBlocked = false;
                this.updateVolumeTimeout = setTimeout(() => {
                    this.__updateVolume(() => {});
                    this.__updateMute(() => {});
                }, 1000);
            });
        }
    };

    // Get mute status with a callback
    public muteStatus = function (callback: (err: any, muted?: boolean) => void) {
        if (this.state.muted !== null) {
            callback(null, this.state.muted);
            return;
        }

        this.__updateMute(() => {
            callback(null, this.state.muted);
        });
    };

    // Set mute on
    public muteOn = function () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on || this.state.muted === true) {
            return;
        }
        this.log.debug("Mute on");
        if (this.web) {
            fetch(`${this.webEventHandlerBaseUrl}MO`, { method: 'GET' });
        } else {
            this.telnetAvr.sendMessage("MO");
        }
    };

    // Set mute off
    public muteOff = function () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on || this.state.muted === false) {
            return;
        }
        this.log.debug("Mute off");
        if (this.web) {
            fetch(`${this.webEventHandlerBaseUrl}MF`, { method: 'GET' });
        } else {
            this.telnetAvr.sendMessage("MF");
        }
    };

    // Request listening mode update
    public __updateListeningMode = function (callback: Function) {
        this.telnetAvr.sendMessage("?S", "SR", callback);
    };

    // Get the current listening mode
    public getListeningMode = function (callback: (err: any, mode?: string) => void) {
        this.__updateListeningMode(() => {
            callback(null, this.state.listeningMode);
        });
    };

    // Toggle between listening modes
    public toggleListeningMode = function (callback: Function) {
        this.lastUserInteraction = Date.now();

        if (!this.isReady) {
            callback();
            return;
        }

        this.log.debug("Toggle Listening Mode", this.state.listeningMode);

        if (["0013", "0101"].includes(this.state.listeningMode)) {
            // Toggle from Pro Logic to Extended Stereo
            this.telnetAvr.sendMessage("0112SR");
            this.state.listeningMode = "0112";
            setTimeout(callback, 100);
        } else {
            // Toggle from Extended Stereo to Pro Logic
            this.state.listeningMode = "0013";
            this.telnetAvr.sendMessage("0013SR", "SR", (error, data) => {
                if (error) {
                    // Fallback to Action listening mode if error occurs
                    this.state.listeningMode = "0101";
                    this.telnetAvr.sendMessage("0101SR");
                }
                setTimeout(callback, 100);
            });
        }
    };
}

// Function to initialize volume management methods
export const initializeVolume = function (this: PioneerAvr) {
    const extendedInstance = new VolumeManagementMethods(this.api, this.log, this.host, this.port, this.maxVolumeSet, this.minVolumeSet, this.service, this.characteristic, this.pioneerAvrClassCallback);
    Object.assign(this, extendedInstance);
};
