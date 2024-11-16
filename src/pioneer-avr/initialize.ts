// src/pioneer-avr/initialize.ts

import { onDataHandler } from './onDataHandler';
import type { Logging } from 'homebridge';
import type { AVState } from './pioneerAvr';
import { TelnetAvr } from '../telnet-avr/telnetAvr';

type Device = {
    name: string;
    ip: string;
    port: number;
    source: string;
};

/**
 * This mixin adds initialization and connection handling capabilities to a base class.
 * It includes methods to handle connection status, set up data handling, and regular state polling.
 * @param Base - The base class to extend.
 * @returns A new class that extends the base class with added initialization logic.
 */
export function InitializeMixin<TBase extends new (...args: any[]) => {
    log: Logging;
    host: string;
    port: number;
    state: AVState;
    isReady: boolean;
    lastUserInteraction: number;
    device: Device;
}>(Base: TBase) {
    return class extends Base {
        public allInterval!: NodeJS.Timeout; // Holds an interval for regular updates
        public telnetAvr!: TelnetAvr;
        public onData!: (error: any, data: string, callback?: Function) => void;
        public __updateVolume!: any;
        public __updatePower!: any;
        public functionSetPowerState!: any;
        public functionSetLightbulbMuted!: any;


        constructor(...args: any[]) {
            super(...args);
            // this.setupTelnetConnection();
        }

        /**
         * Sets up the Telnet connection, handling connect/disconnect events.
         */
        public setupTelnetConnection() {
            if (!this.host || !this.port) {
                this.log.error("Host or port information is missing, cannot initialize TelnetAvr.");
                return;
            }

            this.telnetAvr = new TelnetAvr(this);
            this.onData = onDataHandler(this as any);
            this.isReady = false;

            try {
                this.telnetAvr.onData = this.onData;
                this.telnetAvr.connect(() => this.setupConnectionCallbacks());
            } catch (e) {
                this.log.debug('Pioneer AVR connection error', e);
            }

            this.log.debug("Waiting until Telnet is connected", this.host, this.port);
        }

        /**
         * Sets up connection and disconnection callbacks for the Telnet connection.
         */
        public async setupConnectionCallbacks() {
            try {

                if (!this.telnetAvr) {
                    this.log.error("TelnetAvr instance is not initialized.");
                    return;
                }

                if (!this.telnetAvr.connectionReady) {
                    this.log.info("Telnet is not ready :(");
                    return;
                }

                this.log.info("Telnet connected, starting up");

                this.telnetAvr.addOnDisconnectCallback(() => {
                    // this.log.info("Telnet Disconnected!");
                });

                this.telnetAvr.addOnConnectCallback(async () => {
                    this.log.debug("Telnet connected, waited for PWR...");
                });

                this.telnetAvr.displayChanged = (text: string) => {
                    try {
                        if (text) {
                            this.log.debug("[" + this.device.name + " DISPLAY] " + text);
                        }
                    } catch (error) {
                        this.log.debug('init displayChanged()', error);
                    }

                };

                clearInterval(this.allInterval);
                this.allInterval = setInterval(async () => {
                    try {
                        if (this.lastUserInteraction && Date.now() - this.lastUserInteraction > 48 * 60 * 60 * 1000) {
                            return;
                        }
                        // if (this.telnetAvr.connectionReady && this.isReady && this.state.on && this.state.lastGetPowerStatus !== null) {
                        //     this.__updateVolume?.(() => {});
                        // }
                        if (this.isReady && this.telnetAvr.connectionReady) {
                            this.__updatePower?.(() => {});
                        }
                    } catch (e) {
                        this.log.debug("Polling error", e);
                    }
                }, 29000);

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
            if (!this.telnetAvr || !this.telnetAvr.connectionReady || !this.state.on) {
                return;
            }

            // Implemented key from CURSOR OPERATION
            switch (rk) {
                case "UP":
                    this.telnetAvr.sendMessage("CUP");
                    break;
                case "DOWN":
                    this.telnetAvr.sendMessage("CDN");
                    break;
                case "LEFT":
                    this.telnetAvr.sendMessage("CLE");
                    break;
                case "RIGHT":
                    this.telnetAvr.sendMessage("CRI");
                    break;
                case "ENTER":
                    this.telnetAvr.sendMessage("CEN");
                    break;
                case "RETURN":
                    this.telnetAvr.sendMessage("CRT");
                    break;
                case "HOME_MENU":
                    this.telnetAvr.sendMessage("HM");
                    break;
                case "TOGGLE_PLAY_PAUSE":
                    (this as any).toggleListeningMode();
                    // this.telnetAvr.sendMessage("CTP"); ?
                    break;
                default:
                    this.log.info("Unhandled remote key: %s", rk);
            }
        }

    };
}
