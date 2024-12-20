// src/pioneer-avr/volume.ts

import type { TelnetAvr } from '../telnet-avr/telnetAvr';
import { addExitHandler } from '../exitHandler';
import type { Logging } from 'homebridge';
import type { AVState } from './pioneerAvr';

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
    },
>(Base: TBase) {
    return class extends Base {
        public telnetAvr!: TelnetAvr;
        public updateVolumeTimeout: NodeJS.Timeout | null = null;
        public cancelVolumeDownSteps: boolean = false;
        public activeVolumeDownStepTimeouts: NodeJS.Timeout[] = []; // Array to track active timeouts
        public lastSetVolume: string = '';

        constructor(...args: any[]) {
            super(...args);

            // Handle disconnection by resetting the volume display
            this.telnetAvr.addOnDisconnectCallback(() => {
                try {
                    this.functionSetLightbulbVolume?.(this.state.volume);
                } catch (e) {
                    this.log.debug('functionSetLightbulbVolume error', e);
                }
            });

            // Handle reconnection by updating the volume, mute, and listening mode
            this.telnetAvr.addOnConnectCallback(async () => {
                try {
                    this.functionSetLightbulbVolume?.(this.state.volume);
                    this.__updateListeningMode(() => {});
                    this.__updateVolume(() => {});
                    this.__updateMute(() => {});
                } catch (e) {
                    this.log.debug('functionSetLightbulbVolume error', e);
                }
            });

            // Handle exit by resetting the volume display before shutdown
            addExitHandler(() => {
                this.state.on = false;
                try {
                    this.functionSetLightbulbVolume?.(this.state.volume);
                } catch (e) {
                    this.log.debug('functionSetLightbulbVolume error', e);
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

        /**
         * Retrieves the current listening mode.
         * @param callback - The function to handle the listening mode result.
         */
        public getListeningMode(callback: (err: any, mode?: string) => void) {
            this.__updateListeningMode(() => {
                callback(null, this.state.listeningMode ?? undefined);
            });
        }

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

            if (['0013', '0101'].includes(this.state.listeningMode)) {
                this.telnetAvr.sendMessage('0112SR');
                this.state.listeningMode = '0112';

                // Execute the callback with a delay if provided
                if (callback) {
                    setTimeout(
                        () => {
                            callback(null, this.state.listeningMode!);
                        },
                        100,
                    );
                }
            } else {
                this.state.listeningMode = '0013';
                this.telnetAvr.sendMessage('!0013SR', 'SR', (error, _data) => {
                    if (error) {
                        this.state.listeningMode = '0101';
                        this.telnetAvr.sendMessage('0101SR');
                    }

                    // Execute the callback with a delay if provided
                    if (callback) {
                        setTimeout(
                            () => {
                                callback(null, this.state.listeningMode!);
                            },
                            100,
                        );
                    }
                });
            }
        }
    };
}
