// src/pioneer-avr/pioneerAvr.ts

import type { API, Characteristic, Service, Logging } from 'homebridge';
import { InitializeMixin } from './initialize';
import { InputManagementMixin } from './inputs';
import { PowerManagementMixin } from './power';
import { VolumeManagementMixin } from './volume';
import { TelnetAvr } from '../telnet-avr/telnetAvr';

type Device = {
    name: string;
    origName: string;
    host: string;
    port: number;
    source: string;
    maxVolume?: number;
    minVolume?: number;
};

export interface AVState {
    volume: number;
    on: boolean;
    muted: boolean;
    input: number;
    listeningMode: string | null;
    listeningModeLM: string | null;
    lastGetPowerStatus: number | null;
}

/**
 * The main PioneerAvr class responsible for handling AVR functionality.
 * Mixins are applied in a specific order to ensure proper initialization.
 */
class PioneerAvr extends InitializeMixin(
    InputManagementMixin(
        PowerManagementMixin(
            VolumeManagementMixin(class {
                public api!: API;
                public log!: Logging;
                public host!: string;
                public port!: number;
                public platform!: any;
                public maxVolume: number = 80; // Default max volume
                public minVolume: number = 20; // Default min volume
                public state!: AVState;
                public pioneerAvrClassCallback: any;
                public characteristic!: Characteristic;
                public service!: Service;
                public isReady: boolean = false;
                public accessory: any;
                public device!: Device;
                public lastUserInteraction: number = Date.now();
                public telnetAvr!: TelnetAvr;

                constructor(platform: any, accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
                    this.platform = platform;
                    this.api = platform.api;
                    this.log = platform.log;
                    this.host = accessory.device.host;
                    this.port = accessory.device.port;
                    this.device = accessory.device;
                    this.accessory = accessory;
                    this.service = platform.service;
                    this.characteristic = platform.characteristic;

                    // Set maximum and minimum volume, using defaults if not provided
                    this.maxVolume = this.device.maxVolume || platform.config.maxVolume || this.maxVolume;
                    this.minVolume = this.device.minVolume || platform.config.minVolume || this.minVolume;

                    if (this.maxVolume > 100) this.maxVolume = 100;
                    if (this.maxVolume < 20) this.maxVolume = 20;

                    if (this.minVolume > this.maxVolume) this.minVolume = this.maxVolume - 20;
                    if (this.minVolume < 0) this.minVolume = 0;

                    while (this.maxVolume - this.minVolume < 20 ) {
                        if(this.maxVolume+1 < 100) this.maxVolume++;
                        if(this.minVolume-1 > 0) this.minVolume--;
                    }

                    // Initialize the default state object for the AVR
                    this.state = {
                        volume: 30,
                        on: false,
                        muted: true,
                        input: 0,
                        listeningMode: null,
                        listeningModeLM: null,
                        lastGetPowerStatus: null
                    };

                    // Log initialization
                    this.log.debug('Initializing Pioneer AVR with accessory:', accessory.name);

                    // Set default callback if none is provided
                    if (typeof pioneerAvrClassCallback !== "function") {
                        pioneerAvrClassCallback = async () => {
                            this.log.debug('PioneerAvr() connection ready');
                        };
                    }
                    this.pioneerAvrClassCallback = pioneerAvrClassCallback;

                    // Call setupTelnetConnection to initialize Telnet connection
                    if (typeof (this as any).setupTelnetConnection === 'function') {
                        (this as any).setupTelnetConnection();
                    } else {
                        this.log.debug("setupTelnetConnection function is missing.");
                    }
                }

            })
        )
    )
) {}

// Export the class for use by the platform
export default PioneerAvr;
