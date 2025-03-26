// src/pioneer-avr/volume.ts

import type { TelnetAvr } from '../telnet-avr/telnetAvr';
import { addExitHandler } from '../exitHandler';
import type { Logging } from 'homebridge';
import type { AVState } from './pioneerAvr';

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
 * This mixin adds volume management methods to a base class, including volume control,
 * mute functionality, and listening mode toggling.
 * @param Base - The base class to extend with volume management methods.
 * @returns A new class that extends the base class with added volume management functionality.
 */
export function VolumeManagementMixin<
    TBase extends new (...args: any[]) => {
        log: Logging;
        state: AVState;
        lastUserInteraction: number;
        telnetAvr: TelnetAvr;
        isReady: boolean;
        maxVolume: number;
        minVolume: number;
        device: Device;
        platform: any;
    },
>(Base: TBase) {
    return class extends Base {
        public telnetAvr!: TelnetAvr;
        public device!: Device;
        public platform!: any;
        public updateVolumeTimeout: NodeJS.Timeout | null = null;
        public cancelVolumeDownSteps: boolean = false;
        public activeVolumeDownStepTimeouts: NodeJS.Timeout[] = []; // Array to track active timeouts
        public lastSetVolume: string = '';
        // public allListeingModes: { [key: string]: string } = {
        //     '0001': 'STEREO (cyclic)',
        //     '0009': 'STEREO (direct set) (set to SCI-FI mode.)',
        //     '0151': 'Auto Level Control (A.L.C.)',
        //     '0003': 'Front Stage Surround Advance Focus',
        //     '0004': 'Front Stage Surround Advance Wide (set to PURE DIRECT)',
        //     '0153': 'RETRIEVER AIR',
        //     '0010': 'STANDARD mode.',
        //     '0011': '(2ch source)',
        //     '0013': 'PRO LOGIC2 MOVIE',
        //     '0018': 'PRO LOGIC2x MOVIE',
        //     '0014': 'PRO LOGIC2 MUSIC',
        //     '0019': 'PRO LOGIC2x MUSIC',
        //     '0015': 'PRO LOGIC2 GAME',
        //     '0020': 'PRO LOGIC2x GAME',
        //     '0032': 'WIDE SURROUND MOVIE',
        //     '0033': 'WIDE SURROUND MUSIC',
        //     '0012': 'PRO LOGIC',
        //     '0016': 'Neo:6 CINEMA',
        //     '0017': 'Neo:6 MUSIC',
        //     '0028': 'XM HD SURROUND',
        //     '0029': 'NEURAL SURROUND',
        //     '0024': '(Multi ch source)+PRO LOGIC2x MUSIC',
        //     '0034': '(Multi-ch Source)+PRO LOGIC2z HEIGHT',
        //     '0035': '(Multi-ch Source)+WIDE SURROUND MOVIE',
        //     '0036': '(Multi-ch Source)+WIDE SURROUND MUSIC',
        //     '0025': 'DTS-ES Neo:6',
        //     '0026': 'DTS-ES matrix',
        //     '0027': 'DTS-ES discrete',
        //     '0101': 'ACTION',
        //     '0103': 'DRAMA',
        //     '0102': 'SCI-FI',
        //     '0105': 'MONO FILM',
        //     '0104': 'ENTERTAINMENT SHOW',
        //     '0106': 'EXPANDED THEATER',
        //     '0116': 'TV SURROUND',
        //     '0118': 'ADVANCED GAME',
        //     '0117': 'SPORTS',
        //     '0107': 'CLASSICAL',
        //     '0110': 'ROCK/POP',
        //     '0109': 'UNPLUGGED',
        //     '0112': 'EXTENDED STEREO',
        //     '0113': 'PHONES SURROUND',
        //     '0051': 'PROLOGIC + THX CINEMA',
        //     '0052': 'PL2 MOVIE + THX CINEMA',
        //     '0053': 'Neo:6 CINEMA + THX CINEMA',
        //     '0054': 'PL2x MOVIE + THX CINEMA',
        //     '0092': 'PL2z HEIGHT + THX CINEMA',
        //     '0055': 'THX SELECT2 GAMES',
        //     '0093': 'PL2z HEIGHT + THX MUSIC',
        //     '0073': 'Neo:6 MUSIC + THX MUSIC',
        //     '0074': 'PL2 GAME + THX GAMES',
        //     '0075': 'PL2x GAME + THX GAMES',
        //     '0094': 'PL2z HEIGHT + THX GAMES',
        //     '0076': 'THX ULTRA2 GAMES',
        //     '0077': 'PROLOGIC + THX MUSIC',
        //     '0057': 'THX SURROUND EX (for multi ch)',
        //     '0058': 'PL2x MOVIE + THX CINEMA (for multi ch)',
        //     '0095': 'PL2z HEIGHT + THX CINEMA (for multi ch)',
        //     '0067': 'ES 8ch DISCRETE + THX CINEMA (for multi ch)',
        //     '0031': 'PRO LOGIC2z Height',
        //     '0100': 'ADVANCED SURROUND (cyclic)',
        //     '0050': 'THX (cyclic)',
        //     '0068': 'THX CINEMA (for 2ch)',
        //     '0069': 'THX MUSIC (for 2ch)',
        //     '0070': 'THX GAMES (for 2ch)',
        //     '0071': 'PL2 MUSIC + THX MUSIC',
        //     '0072': 'PL2x MUSIC + THX MUSIC',
        //     '0078': 'PROLOGIC + THX GAMES',
        //     '0056': 'THX CINEMA (for multi ch)',
        //     '0059': 'ES Neo:6 + THX CINEMA (for multi ch)',
        //     '0060': 'ES MATRIX + THX CINEMA (for multi ch)',
        //     '0061': 'ES DISCRETE + THX CINEMA (for multi ch)',
        //     '0062': 'THX SELECT2 CINEMA (for multi ch)',
        //     '0063': 'THX SELECT2 MUSIC (for multi ch)',
        //     '0064': 'THX SELECT2 GAMES (for multi ch)',
        //     '0065': 'THX ULTRA2 CINEMA (for multi ch)',
        //     '0066': 'THX ULTRA2 MUSIC (for multi ch)',
        //     '0079': 'THX ULTRA2 GAMES (for multi ch)',
        //     '0080': 'THX MUSIC (for multi ch)',
        //     '0081': 'THX GAMES (for multi ch)',
        //     '0082': 'PL2x MUSIC + THX MUSIC (for multi ch)',
        //     '0096': 'PL2z HEIGHT + THX MUSIC (for multi ch)',
        //     '0083': 'EX + THX GAMES (for multi ch)',
        //     '0097': 'PL2z HEIGHT + THX GAMES (for multi ch)',
        //     '0084': 'Neo:6 + THX MUSIC (for multi ch)',
        //     '0085': 'Neo:6 + THX GAMES (for multi ch)',
        //     '0086': 'ES MATRIX + THX MUSIC (for multi ch)',
        //     '0087': 'ES MATRIX + THX GAMES (for multi ch)',
        //     '0088': 'ES DISCRETE + THX MUSIC (for multi ch)',
        //     '0089': 'ES DISCRETE + THX GAMES (for multi ch)',
        //     '0090': 'ES 8CH DISCRETE + THX MUSIC (for multi ch)',
        //     '0091': 'ES 8CH DISCRETE + THX GAMES (for multi ch)',
        //     '0005': 'AUTO SURR/STREAM DIRECT (cyclic)',
        //     '0006': 'AUTO SURROUND',
        //     '0152': 'OPTIMUM SURROUND',
        //     '0007': 'DIRECT',
        //     '0008': 'PURE DIRECT'
        // };

        constructor(...args: any[]) {
            super(...args);

            // Handle disconnection by resetting the volume display
            this.telnetAvr.addOnDisconnectCallback(() => {
                try {
                    this.functionSetLightbulbVolume?.(this.state.volume);
                } catch (e) {
                    this.log.debug('functionSetLightbulbVolume error', e);
                }

                try {
                    this.functionSetSwitchListeningMode?.();
                } catch (e) {
                    this.log.debug('functionSetSwitchListeningMode error', e);
                }
            });

            // Handle reconnection by updating the volume, mute, and listening mode
            this.telnetAvr.addOnConnectCallback(async () => {
                setTimeout(async () => {
                    try {
                        let error: any = null;
                        let attempts = 0;

                        if (this.state.on) {
                            do {
                                error = await new Promise<any>((resolve) => {
                                    this.__updateListeningMode((err: any) => resolve(err));
                                });
                                if (error) {
                                    await new Promise((resolve) => setTimeout(resolve, 1500));
                                    attempts++;
                                }
                            } while (error && attempts < 10);
                        }

                        error = null;
                        attempts = 0;
                        do {
                            error = await new Promise<any>((resolve) => {
                                this.__updateVolume((err: any) => resolve(err));
                            });
                            if (error) {
                                await new Promise((resolve) => setTimeout(resolve, 1500));
                                attempts++;
                            }
                        } while (error && attempts < 10);

                        error = null;
                        attempts = 0;
                        do {
                            error = await new Promise<any>((resolve) => {
                                this.__updateMute((err: any) => resolve(err));
                            });
                            if (error) {
                                await new Promise((resolve) => setTimeout(resolve, 1500));
                                attempts++;
                            }
                        } while (error && attempts < 10);

                        this.functionSetLightbulbVolume?.(this.state.volume);
                        this.functionSetSwitchListeningMode?.();

                    } catch (e) {
                        this.log.debug('functionSetLightbulbVolume error', e);
                    }
                }, 5321);
            });


            // Handle exit by resetting the volume display before shutdown
            addExitHandler(() => {
                this.state.on = false;
                try {
                    this.functionSetLightbulbVolume?.(this.state.volume);
                } catch (e) {
                    this.log.debug('functionSetLightbulbVolume error', e);
                }

                try {
                    this.functionSetSwitchListeningMode?.();
                } catch (e) {
                    this.log.debug('functionSetSwitchListeningMode error', e);
                }
            }, this);

        }

        /**
         * Placeholder for setting the volume of the AVR.
         * Intended to be overridden externally.
         */
        public functionSetLightbulbVolume(_argument?: any) {
            // Implement volume setting logic here
        }

        public functionSetLightbulbMuted(_argument?: any) {}

        public functionSetSwitchListeningMode(_argument?: any) {}

        /**
         * Sends a volume status query to the AVR and updates the volume state.
         * @param callback - Function to run after updating the volume.
         */
        public async __updateVolume(
            callback: (error: any, response: string) => void,
        ) {
            this.telnetAvr.sendMessage('?V', 'VOL', callback);
        }

        /**
         * Sends a mute status query to the AVR and updates the mute state.
         * @param callback - Function to run after updating the mute state.
         */
        public async __updateMute(
            callback: (error: any, response: string) => void,
        ) {
            this.telnetAvr.sendMessage('?M', 'MUT', callback);
        }

        /**
         * Retrieves the current volume status.
         * @param callback - The function to handle the volume result.
         */
        public volumeStatus(callback: (err: any, volume?: number) => void) {
            if (this.state.volume !== null) {
                callback(null, this.state.volume);
                return;
            }

            this.__updateVolume(() => {
                callback(null, this.state.volume);
            });
        }

        /**
         * Sets a specific volume on the AVR.
         * @param targetVolume - The desired volume level.
         * @param callback - The function to call after setting the volume.
         */
        public setVolume(
            targetVolume: number,
            callback?: (error: any, response: string) => void,
        ) {
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on
            ) {
                return;
            }

            targetVolume = parseInt(targetVolume.toString(), 10);

            if (
                isNaN(targetVolume) ||
                    Math.floor(targetVolume) === this.state.volume
            ) {
                if (callback) {
                    try {
                        callback(null, '');
                    } catch (e) {
                        this.log.debug('', e);
                    }
                }
                return;
            }

            let vsxVol = 0;

            if (this.maxVolume > 0) {
                const minVolumeIn185 = this.minVolume / 100 * 185;
                const maxVolumeIn185 = this.maxVolume / 100 * 185;
                vsxVol =
                    targetVolume / 100 * (maxVolumeIn185 - minVolumeIn185) +
                    minVolumeIn185;
            } else {
                vsxVol = targetVolume * 185 / 100;
            }

            vsxVol = Math.floor(vsxVol);
            const vsxVolStr = vsxVol.toString().padStart(3, '0');

            if (this.lastSetVolume !== vsxVolStr) {
                this.lastSetVolume = vsxVolStr;

                this.telnetAvr.sendMessage(`${vsxVolStr}VL`, undefined, callback);
                this.lastUserInteraction = Date.now();
            }
        }

        /**
         * Increases the volume by one step.
         */
        public volumeUp() {
            this.lastUserInteraction = Date.now();
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on
            ) {
                return;
            }

            this.log.debug('Volume up');

            if (this.updateVolumeTimeout) {
                clearTimeout(this.updateVolumeTimeout);
            }

            this.telnetAvr.sendMessage('VU', undefined, () => {
                this.updateVolumeTimeout = setTimeout(() => {
                    this.__updateVolume(() => {});
                    this.__updateMute(() => {});
                }, 1000);
            });
        }

        /**
         * Decreases the volume by three steps, with a delay of 100ms between each step.
         */
        public volumeDown() {
            this.lastUserInteraction = Date.now();
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on
            ) {
                return;
            }

            this.log.debug('Volume down');

            // Cancel any ongoing steps and clear active timeouts
            this.cancelVolumeDownSteps = true;
            if (this.updateVolumeTimeout) {
                clearTimeout(this.updateVolumeTimeout);
            }

            this.activeVolumeDownStepTimeouts.forEach((timeout) => {
                clearTimeout(timeout);
            },
            );
            this.activeVolumeDownStepTimeouts = [];

            const steps = 3;
            const delay = 25;

            // Function to execute each step with a delay
            const executeStep = (step: number) => {
                if (step > 0 && !this.cancelVolumeDownSteps) {
                    this.telnetAvr.sendMessage('VD', 'VOL', () => {
                        const timeout = setTimeout(() => {
                            executeStep(step - 1);
                        }, delay);
                        this.activeVolumeDownStepTimeouts.push(timeout); // Track the timeout
                    });
                } else if (step === 0 && !this.cancelVolumeDownSteps) {
                    if (this.updateVolumeTimeout) {
                        clearTimeout(this.updateVolumeTimeout);
                    }
                    // After the last step, update volume and mute status
                    this.updateVolumeTimeout = setTimeout(() => {
                        this.__updateVolume(() => {});
                        this.__updateMute(() => {});
                    }, 1000);
                }
            };

            // Reset the cancel flag and start the first step
            this.cancelVolumeDownSteps = false;
            executeStep(steps);
        }

        /**
         * Retrieves the mute status of the AVR.
         * @param callback - The function to handle the mute result.
         */
        public muteStatus(callback: (err: any, muted?: boolean) => void) {
            if (this.state.muted !== null) {
                callback(null, this.state.muted);
                return;
            }

            this.__updateMute(() => {
                callback(null, this.state.muted);
            });
        }

        /**
         * Sends a mute-on command to the AVR.
         */
        public muteOn() {
            this.lastUserInteraction = Date.now();
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on ||
                this.state.muted === true
            ) {
                return;
            }

            this.log.debug('Mute on');
            this.telnetAvr.sendMessage('MO');
        }

        /**
         * Sends a mute-off command to the AVR.
         */
        public muteOff() {
            this.lastUserInteraction = Date.now();
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on ||
                this.state.muted === false
            ) {
                return;
            }

            this.log.debug('Mute off');
            this.telnetAvr.sendMessage('MF');
        }

        /**
         * Sends a query to update the current listening mode.
         * @param callback - The function to handle the response.
         */
        public __updateListeningMode(
            callback: (error: any, response: string) => void,
        ) {
            this.telnetAvr.sendMessage('?S', 'SR', callback);
        }

        // /**
        //  * Retrieves the current listening mode.
        //  * @param callback - The function to handle the listening mode result.
        //  */
        // public getListeningMode(callback: (err: any, mode?: string) => void) {
        //     if (this.state.listeningMode) {
        //         callback(null, this.state.listeningMode);
        //
        //     } else {
        //         this.__updateListeningMode(() => {
        //             callback(null, this.state.listeningMode ?? undefined);
        //         });
        //     }
        // }

        /**
         * Toggles the listening mode between presets.
         * @param callback - Optional function to handle the toggle result.
         */
        public toggleListeningMode(
            callback?: (error: any, response: string) => void,
        ) {
            this.lastUserInteraction = Date.now();

            // Check if the AVR is ready and if a listening mode is set
            if (!this.isReady || !this.state.listeningMode) {
                if (callback) {
                    callback(null, this.state.listeningMode ?? '');
                }
                return;
            }

            this.log.debug('Toggle Listening Mode', this.state.listeningMode);

            const isValidListeningMode = (value: string | undefined, defaultValue: string): string => {
                return /^[0-9]{4}$/.test(value || '') ? value! : defaultValue;
            };

            const listeningModeOne = isValidListeningMode(this.device.listeningMode || this.platform.config.listeningMode, '0013'); // PRO LOGIC2 MOVIE
            const listeningModeFallback = isValidListeningMode(this.device.listeningModeFallback || this.platform.config.listeningModeFallback, '0101'); // ACTION
            const listeningModeOther = isValidListeningMode(this.device.listeningModeOther || this.platform.config.listeningModeOther, '0112'); // EXTENDED STEREO
            if ([listeningModeOne, listeningModeFallback].includes(this.state.listeningMode)) {
                this.telnetAvr.sendMessage(listeningModeOther + 'SR');
                this.state.listeningMode = listeningModeOther;

                if (callback) {
                    callback(null, this.state.listeningMode!);
                }
            } else {
                this.state.listeningMode = listeningModeOne;
                this.telnetAvr.sendMessage('!' + listeningModeOne + 'SR', 'SR', (error, _data) => {
                    if (error) {
                        this.state.listeningMode = listeningModeFallback;
                        setTimeout(() => {
                            this.telnetAvr.sendMessage(listeningModeFallback + 'SR');
                        }, 100);

                    }

                    if (callback) {
                        callback(null, this.state.listeningMode!);
                    }
                });
            }
        }
    };
}
