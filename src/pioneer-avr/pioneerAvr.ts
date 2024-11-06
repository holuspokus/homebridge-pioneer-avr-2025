// src/pioneer-avr/pioneerAvr.ts

import type { API, Characteristic, Service, Logging } from 'homebridge';
import { initializePioneerAvr } from './initialize';
import { loadInputs } from './inputs';
import { powerMethods } from './power';
import { volumeMethods } from './volume';
import { TelnetAvr } from '../telnet-avr/telnetAvr'; // Import the TelnetAvr class

export interface AVState {
    volume: number;
    on: boolean;
    muted: boolean;
    input: number;
    listeningMode: string | null;
    listeningModeLM: string | null;
    lastGetPowerStatus: number | null;
}

class PioneerAvr {
    public readonly api: API;
    public readonly log: Logging;
    public readonly host: string;
    public readonly port: number;
    public maxVolumeSet: number;
    public minVolumeSet: number;
    public state: AVState;
    public pioneerAvrClassCallback: any;
    public initCount: number;
    public readonly characteristic: typeof Characteristic;
    public readonly service: typeof Service;



    constructor(api: API, log: Logging, host: string, port: number, maxVolumeSet: number, minVolumeSet: number, service: Service, characteristic: Characteristic, pioneerAvrClassCallback?: () => Promise<void>) {
        this.api = api;
        this.log = log;
        this.host = host;
        this.port = port;
        this.maxVolumeSet = isNaN(maxVolumeSet) ? 60 : maxVolumeSet;
        this.minVolumeSet = isNaN(minVolumeSet) ? 0 : minVolumeSet;

        this.service = service;
        this.characteristic = characteristic;

        this.state = {
            volume: 30,
            on: false,
            muted: true,
            input: 0,
            listeningMode: null,
            listeningModeLM: null,
            lastGetPowerStatus: null
        };

        if (typeof pioneerAvrClassCallback !== "function") {
            pioneerAvrClassCallback = async () => {
                this.log.debug('PioneerAvr() conn ready');
            };
        }

        this.pioneerAvrClassCallback = pioneerAvrClassCallback;

        // Hier die Initialisierung aufrufen
        initializePioneerAvr.call(this);
        loadInputs.call(this);
        initializePower.call(this);
        initializeVolume.call(this);
    }

}

export default PioneerAvr;
