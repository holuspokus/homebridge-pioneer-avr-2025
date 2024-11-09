// src/pioneer-avr/pioneerAvr.ts

import type { API, Characteristic, Service, Logging } from 'homebridge';
import { InitializeMixin } from './initialize';
import { InputManagementMixin } from './inputs';
import { PowerManagementMixin } from './power';
import { VolumeManagementMixin } from './volume';
import { TelnetAvr } from '../telnet-avr/telnetAvr';

type Device = {
    name: string;
    ip: string;
    port: number;
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
                public maxVolumeSet: number = 60; // Default max volume
                public minVolumeSet: number = 0;  // Default min volume
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
                    this.host = accessory.device.ip;
                    this.port = accessory.device.port;
                    this.device = accessory.device;
                    this.accessory = accessory;
                    this.service = platform.service;
                    this.characteristic = platform.characteristic;

                    // Set maximum and minimum volume, using defaults if not provided
                    this.maxVolumeSet = platform.config.maxVolumeSet || this.maxVolumeSet;
                    this.minVolumeSet = platform.config.minVolumeSet || this.minVolumeSet;

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

                    this.log.info('initialize PioneerAvr');

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

export default PioneerAvr;
