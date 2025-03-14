// src/pioneer-avr/initialize.ts

import { onDataHandler } from './onDataHandler';
import type { Logging } from 'homebridge';
import type { AVState } from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';
import { addExitHandler } from '../exitHandler';


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
 * This mixin adds initialization and connection handling capabilities to a base class.
 * It includes methods to handle connection status, set up data handling, and regular state polling.
 * @param Base - The base class to extend.
 * @returns A new class that extends the base class with added initialization logic.
 */
export function InitializeMixin<
    TBase extends new (...args: any[]) => {
        log: Logging;
        host: string;
        port: number;
        state: AVState;
        isReady: boolean;
        lastUserInteraction: number;
        device: Device;
    },
>(Base: TBase) {
    return class extends Base {
        public allInterval!: NodeJS.Timeout; // Holds an interval for regular updates
        public telnetAvr!: TelnetAvr;
        public onData!: (error: any, data: string, callback?: Function) => void;
        public __updateVolume!: any;
        public __updatePower!: any;
        public __updateListeningMode!: any;
        public platform!: any;
        public functionSetPowerState!: any;
        public functionSetLightbulbMuted!: any;
        public functionSetSwitchListeningMode!: any;
        public functionSetSwitchTelnetConnected!: any;
        public allIntervalCounter: number = 0;

        constructor(...args: any[]) {
            super(...args);
            // this.setupTelnetConnection();


            addExitHandler(() => {
                if (this.allInterval) {
                    clearInterval(this.allInterval);
                }
            }, this);


        }

        /**
         * Sets up the Telnet connection, handling connect/disconnect events.
         */
        public setupTelnetConnection() {
            if (!this.host || !this.port) {
                this.log.error(
                    'Host or port information is missing, cannot initialize TelnetAvr.',
                );
                return;
            }

            this.telnetAvr = new TelnetAvr(this);
            this.onData = onDataHandler(this as any);
            this.isReady = false;

            try {
                this.telnetAvr.onData = this.onData;
                this.telnetAvr.connect(async () => this.setupConnectionCallbacks());
            } catch (e) {
                this.log.debug('Pioneer AVR connection error', e);
            }

            this.log.debug(
                'Waiting until Telnet is connected to',
                this.host,
                this.port,
            );
        }

        /**
         * Sets up connection and disconnection callbacks for the Telnet connection.
         */
        public async setupConnectionCallbacks() {
            try {
                if (!this.telnetAvr) {
                    this.log.error(this.device.name + '> ' + 'TelnetAvr instance is not initialized.');
                    return;
                }

                if (!this.telnetAvr.connectionReady) {
                    this.log.info(this.device.name + '> ' + 'Telnet is not ready :(');
                    return;
                }

                this.log.info(this.device.name + '> ' + 'Telnet connected, starting up');

                this.telnetAvr.addOnDisconnectCallback(() => {
                    // this.log.info('Telnet Disconnected!');
                });

                this.telnetAvr.addOnConnectCallback(async () => {
                    this.log.debug(this.device.name + '> ' + 'Telnet connected, waited for PWR...');
                });

                this.telnetAvr.displayChanged = (text: string) => {
                    try {
                        if (text) {
                            this.log.debug(
                                '[' + this.device.name + ' DISPLAY] ' + text,
                            );
                        }
                    } catch (error) {
                        this.log.debug('init displayChanged()', error);
                    }
                };

                if (this.allInterval) {
                    clearInterval(this.allInterval);
                }
                this.allInterval = setInterval(async () => {
                    try {
                        // Ensure sendKeepAliveTimeout is a number within the range [5 minutes, 2 weeks]
                        // If not set, default to 48 hours
                        let keepAliveTimeoutMinutes: number;
                        let rawTimeout: unknown = this.platform?.config?.sendKeepAliveTimeoutMinutes;

                        // If rawTimeout is a string, convert it to a number
                        if (typeof rawTimeout === "string") {
                            rawTimeout = parseInt(rawTimeout, 10);
                        }

                        // Process the timeout value, ensuring it falls within the allowed range (5 to 20160 minutes)
                        if (typeof rawTimeout === "number" && !isNaN(rawTimeout)) {
                            if (rawTimeout < 5) {
                                keepAliveTimeoutMinutes = 5;
                            } else if (rawTimeout > 20160) {
                                keepAliveTimeoutMinutes = 20160;
                            } else {
                                keepAliveTimeoutMinutes = rawTimeout;
                            }
                        } else {
                            keepAliveTimeoutMinutes = 2880; // Default to 48 hours (2880 minutes) if not set
                        }

                        // Convert minutes to milliseconds
                        const keepAliveTimeoutMs = keepAliveTimeoutMinutes * 60 * 1000;

                        if (
                            !this.state.on &&
                            this.lastUserInteraction &&
                            Date.now() - this.lastUserInteraction > keepAliveTimeoutMs
                        ) {
                            this.allIntervalCounter = 0;
                            return;
                        }


                        if (
                            this.isReady &&
                            this.telnetAvr.connectionReady &&
                            this.telnetAvr.connection.lastMessageReceived !== null &&
                            Date.now() - this.telnetAvr.connection.lastMessageReceived > 29000 &&
                            (this.state.on || this.telnetAvr.connection.forcedDisconnect !== true)
                        ) {
                            if (this.allIntervalCounter % 2 === 0) {
                                this.__updatePower?.(() => {});
                            } else {
                                if (this.state.on && !this.state.listeningMode) {
                                    this.__updateListeningMode?.(() => {});
                                } else {
                                    this.__updateVolume?.(() => {});
                                }
                            }

                            this.allIntervalCounter++;
                        }
                    } catch (e) {
                        this.log.debug('Polling error', e);
                    }
                }, 2031);
            } catch (error) {
                console.log('setupConnectionCallbacks() error' + String(error));
            }
        }

        /**
         * Sends a remote key command based on the provided key.
         * @param rk - The remote key to be processed.
         */
        public remoteKey(rk: string) {
            this.lastUserInteraction = Date.now();
            if (
                !this.telnetAvr ||
                !this.telnetAvr.connectionReady ||
                !this.state.on
            ) {
                return;
            }

            // Implemented key from CURSOR OPERATION
            switch (rk) {
                case 'UP':
                    this.telnetAvr.sendMessage('CUP');
                    break;
                case 'DOWN':
                    this.telnetAvr.sendMessage('CDN');
                    break;
                case 'LEFT':
                    this.telnetAvr.sendMessage('CLE');
                    break;
                case 'RIGHT':
                    this.telnetAvr.sendMessage('CRI');
                    break;
                case 'ENTER':
                    this.telnetAvr.sendMessage('CEN');
                    break;
                case 'RETURN':
                    this.telnetAvr.sendMessage('CRT');
                    break;
                case 'HOME_MENU':
                    this.telnetAvr.sendMessage('HM');
                    break;
                case 'TOGGLE_PLAY_PAUSE':
                    (this as any).toggleListeningMode();
                    // this.telnetAvr.sendMessage('CTP'); ?
                    break;
                default:
                    this.log.info('Unhandled remote key: %s', rk);
            }
        }
    };
}
