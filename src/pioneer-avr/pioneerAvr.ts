// src/pioneer-avr/pioneerAvr.ts

import { initialize } from './initialize';
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
    private log: any;
    private host: string;
    private port: number;
    private maxVolumeSet: number;
    private minVolumeSet: number;
    private state: AVState;
    public inputBeingAdded: string | boolean = false;
    public inputBeingAddedWaitCount = 0;
    public inputMissing: string[][] = [];
    public telnetAvr!: TelnetAvr; // TelnetAvr property declaration with definite assignment


    constructor(log: any, host: string, port: number, maxVolumeSet: number, minVolumeSet: number, pioneerAvrClassCallback?: () => Promise<void>) {
        this.log = log;
        this.host = host;
        this.port = port;
        this.maxVolumeSet = isNaN(maxVolumeSet) ? 60 : maxVolumeSet;
        this.minVolumeSet = isNaN(minVolumeSet) ? 0 : minVolumeSet;

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
        initialize.call(this);
        loadInputs.call(this);
        powerMethods(this);
        volumeMethods(this);
    }


    // Dummy method placeholders
    public functionSetPowerState(state: boolean) {
        // Implement your logic here
    }

    public functionSetLightbulbMuted(muted: boolean) {
        // Implement your logic here
    }

    public functionSetActiveIdentifier(input: number) {
        // Implement your logic here
    }

    public functionSetLightbulbVolume(volume: number) {
        // Implement your logic here
    }

}

export default PioneerAvr;
