// src/pioneer-avr/power.ts

import type { TelnetAvr } from '../telnet-avr/telnetAvr';
import { addExitHandler } from '../exitHandler';
import type { Logging } from 'homebridge';
import type { AVState } from './pioneerAvr';

/**
 * This mixin adds power management methods to a base class, including power control,
 * status checking, and handling disconnections.
 * @param Base - The base class to extend with power management methods.
 * @returns A new class that extends the base class with added power management functionality.
 */
export function PowerManagementMixin<
    TBase extends new (...args: any[]) => {
        log: Logging;
        state: AVState;
        lastUserInteraction: number;
        telnetAvr: TelnetAvr;
    },
>(Base: TBase) {
    return class extends Base {
        public telnetAvr!: TelnetAvr;

        constructor(...args: any[]) {
            super(...args);

            // Handle disconnection by setting power state to off and invoking callback
            this.telnetAvr.addOnDisconnectCallback(() => {
                this.state.on = false;
                try {
                    this.functionSetPowerState(this.state.on);
                } catch (e) {
                    this.log.debug('functionSetPowerState', e);
                }
            });

            // Handle connection by restoring the last known power state
            this.telnetAvr.addOnConnectCallback(async () => {
                try {
                    this.functionSetPowerState(this.state.on);
                } catch (e) {
                    this.log.debug('functionSetPowerState', e);
                }
            });

            // Handle exit event by setting power state to off before shutdown
            addExitHandler(() => {
                this.state.on = false;
                this.functionSetPowerState(this.state.on);
            }, this);
        }

        /**
         * Placeholder for setting the power state of the AVR.
         * Intended to be overridden externally.
         */
        public functionSetPowerState(_state: boolean) {
            // Placeholder logic for setting power state, should be overridden externally
        }

        /**
         * Sends a power status query to the AVR and updates the power state.
         * @param callback - Function to run after updating power state.
         */
        public async __updatePower(callback: () => void) {
            this.telnetAvr.sendMessage('?P', 'PWR', () => {
                this.state.lastGetPowerStatus = Date.now();
                try {
                    callback();
                } catch (e) {
                    this.log.debug('__updatePower callback', e);
                }
            });
        }

        /**
         * Retrieves the power status of the AVR.
         * @param callback - The function to handle the power status result.
         */
        public async powerStatus(
            callback: (err: any, status?: boolean) => void,
        ) {
            if (this.state.on !== null) {
                try {
                    callback(null, this.state.on);
                } catch (e) {
                    this.log.debug('powerStatus', e);
                }
                return;
            }

            // If state is not known, query AVR for current power status
            this.__updatePower(() => {
                try {
                    callback(null, this.state.on);
                } catch (e) {
                    this.log.debug('powerStatus2', e);
                }
            });
        }

        /**
         * Sends a power-on command to the AVR and updates the power status.
         */
        public async powerOn() {
            this.log.debug('Power on');

            this.telnetAvr.sendMessage('PO');
            this.lastUserInteraction = Date.now();

            // Allow some time for the command to take effect, then check status
            setTimeout(() => {
                this.powerStatus(() => {});
            }, 500);
        }

        /**
         * Sends a power-off command to the AVR and updates the power status.
         */
        public async powerOff() {
            this.log.debug('Power off');

            this.telnetAvr.sendMessage('PF');
            this.lastUserInteraction = Date.now();

            // Allow some time for the command to take effect, then check status
            setTimeout(() => {
                this.powerStatus(() => {});
            }, 500);
        }
    };
}
