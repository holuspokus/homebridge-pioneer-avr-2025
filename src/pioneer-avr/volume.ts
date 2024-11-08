// src/pioneer-avr/volume.ts

import PioneerAvr from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
// import { API, Logging, Service, Characteristic } from 'homebridge';
import { addExitHandler } from '../exitHandler';

class VolumeManagementMethods extends PioneerAvr {
    public telnetAvr!: TelnetAvr;
    private updateVolumeTimeout: NodeJS.Timeout | null = null;
    public lastUserInteraction!: number;

    constructor(accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
        super(accessory, pioneerAvrClassCallback);

        // Handle disconnection
        this.telnetAvr.addOnDisconnectCallback(() => {
            try {
                if ((this as any).functionSetLightbulbVolume) {
                    (this as any).functionSetLightbulbVolume(this.state.volume);
                }
            } catch (e) {
                this.log.debug("functionSetLightbulbVolume error", e);
            }
        });

        // Handle connection
        this.telnetAvr.addOnConnectCallback(async () => {
            try {
                (this as any).functionSetLightbulbVolume(this.state.volume);
                this.__updateListeningMode(() => {});
                this.__updateVolume(() => {});
                this.__updateMute(() => {});
            } catch (e) {
                this.log.debug("functionSetLightbulbVolume error", e);
            }
        });

        // Handle exit
        addExitHandler(() => {
            this.state.on = false;
            try {
                if ((this as any).functionSetLightbulbVolume) {
                    (this as any).functionSetLightbulbVolume(this.state.volume);
                }
            } catch (e) {
                this.log.debug("functionSetLightbulbVolume error", e);
            }
        }, this);
    }

    public functionSetLightbulbVolume() {
        // Implement volume setting logic here
    }

    public functionSetLightbulbMuted() {}

    public async __updateVolume(callback: (error: any, response: string) => void) {
        this.telnetAvr.sendMessage("?V", "VOL", callback);
    };

    public async __updateMute(callback: (error: any, response: string) => void) {
        this.telnetAvr.sendMessage("?M", "MUT", callback);
    };

    public volumeStatus (callback: (err: any, volume?: number) => void) {
        if (this.state.volume !== null) {
            callback(null, this.state.volume);
            return;
        }

        this.__updateVolume(() => {
            callback(null, this.state.volume);
        });
    };

    public setVolume (targetVolume: number, callback: (error: any, response: string) => void) {
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }

        targetVolume = parseInt(targetVolume.toString(), 10);

        if (isNaN(targetVolume) || Math.floor(targetVolume) === this.state.volume) {
            callback(null, '');
            return;
        }

        let vsxVol = 0;

        if (this.maxVolumeSet > 0) {
            const minVolumeIn185 = (this.minVolumeSet / 100) * 185;
            const maxVolumeIn185 = (this.maxVolumeSet / 100) * 185;
            vsxVol = ((targetVolume / 100) * (maxVolumeIn185 - minVolumeIn185)) + minVolumeIn185;
        } else {
            vsxVol = (targetVolume * 185) / 100;
        }

        vsxVol = Math.floor(vsxVol);
        const vsxVolStr = vsxVol.toString().padStart(3, '0');

        this.telnetAvr.sendMessage(`${vsxVolStr}VL`, undefined, callback);
        this.lastUserInteraction = Date.now();
    };

    public volumeUp () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }
        this.log.debug("Volume up");

        if (this.updateVolumeTimeout) {
            clearTimeout(this.updateVolumeTimeout);
        }

        this.telnetAvr.sendMessage("VU", undefined, () => {
            this.updateVolumeTimeout = setTimeout(() => {
                this.__updateVolume(() => {});
                this.__updateMute(() => {});
            }, 1000);
        });

    };

    public volumeDown () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
            return;
        }
        this.log.debug("Volume down");

        if (this.updateVolumeTimeout) {
            clearTimeout(this.updateVolumeTimeout);
        }

        this.telnetAvr.sendMessage("VD", undefined, () => {
            this.updateVolumeTimeout = setTimeout(() => {
                this.__updateVolume(() => {});
                this.__updateMute(() => {});
            }, 1000);
        });

    };

    public muteStatus (callback: (err: any, muted?: boolean) => void) {
        if (this.state.muted !== null) {
            callback(null, this.state.muted);
            return;
        }

        this.__updateMute(() => {
            callback(null, this.state.muted);
        });
    };

    public muteOn () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on || this.state.muted === true) {
            return;
        }
        this.log.debug("Mute on");
        this.telnetAvr.sendMessage("MO");
    };

    public muteOff () {
        this.lastUserInteraction = Date.now();
        if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on || this.state.muted === false) {
            return;
        }
        this.log.debug("Mute off");
        this.telnetAvr.sendMessage("MF");
    };

    public __updateListeningMode (callback: (error: any, response: string) => void) {
        this.telnetAvr.sendMessage("?S", "SR", callback);
    };

    public getListeningMode (callback: (err: any, mode?: string) => void) {
        this.__updateListeningMode(() => {
            callback(null, this.state.listeningMode ?? undefined);
        });
    };

    public toggleListeningMode (callback: (error: any, response: string) => void) {
        this.lastUserInteraction = Date.now();

        if (!this.isReady || !this.state.listeningMode) {
            callback(null, this.state.listeningMode ?? '');
            return;
        }

        this.log.debug("Toggle Listening Mode", this.state.listeningMode);

        if (["0013", "0101"].includes(this.state.listeningMode)) {
            this.telnetAvr.sendMessage("0112SR");
            this.state.listeningMode = "0112";
            setTimeout(callback, 100);
        } else {
            this.state.listeningMode = "0013";
            this.telnetAvr.sendMessage("0013SR", "SR", (error, _data) => {
                if (error) {
                    this.state.listeningMode = "0101";
                    this.telnetAvr.sendMessage("0101SR");
                }
                setTimeout(callback, 100);
            });
        }
    };
}

// Initialize volume management methods and add them to the current instance
export const initializeVolume = function (this: PioneerAvr) {
    const extendedInstance = new VolumeManagementMethods(
        this.accessory,
        this.pioneerAvrClassCallback
    );

    Object.assign(this, extendedInstance as Omit<typeof extendedInstance, keyof PioneerAvr>); // Merging methods into the PioneerAvr instance
};
