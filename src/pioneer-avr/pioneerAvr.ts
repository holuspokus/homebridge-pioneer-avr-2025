// src/pioneer-avr/pioneerAvr.ts

import type { API, Characteristic, Service, Logging } from 'homebridge';
import { initializePioneerAvr } from './initialize';
import { initializeInputs } from './inputs';
import { initializePower } from './power';
import { initializeVolume } from './volume';

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
    public characteristic: Characteristic;
    public service: Service;
    public isReady: boolean = false;
    protected accessory: any;



    constructor(accessory: any, pioneerAvrClassCallback?: () => Promise<void>) {
        this.api = accessory.platform.api;
        this.log = accessory.platform.log;
        this.host = accessory.host;
        this.port = accessory.port;

        this.maxVolumeSet = isNaN(accessory.platform.config.maxVolumeSet) ? 60 : accessory.platform.config.maxVolumeSet;
        this.minVolumeSet = isNaN(accessory.platform.config.minVolumeSet) ? 0 : accessory.platform.config.minVolumeSet;

        this.service = accessory.platform.service;
        this.characteristic = accessory.platform.characteristic;

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
        initializeInputs.call(this);
        initializePower.call(this);
        initializeVolume.call(this);
    }

}

export default PioneerAvr;
