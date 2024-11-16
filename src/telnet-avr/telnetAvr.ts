// src/telnet-avr/telnetAvr.ts

import { Connection } from "./connection";
import PioneerAvr from '../pioneer-avr/pioneerAvr';

const DEFAULT_PORT = 23;
const DEFAULT_HOST = "127.0.0.1";

export class TelnetAvr {
    public readonly connection: Connection;
    public onData: (error: any, data: string, callback?: Function) => void = () => {};
    private onDisconnectCallbacks: Array<() => void> = []; // List for onDisconnect callbacks
    private onConnectCallbacks: Array<() => void> = []; // Callbacks for onConnect
    public connectionReady = false;
    public host: string;
    public port: number;
    public log: any;
    public avr: PioneerAvr;

    constructor(pioneerAvr: any) {
        // Use the properties from the passed-in PioneerAvr instance
        this.host = pioneerAvr.host || DEFAULT_HOST;
        this.port = pioneerAvr.port || DEFAULT_PORT;
        this.log = pioneerAvr.log;
        this.avr = pioneerAvr;

        this.connection = new Connection(this);

        this.connection.onDisconnect = () => {
            this.connectionReady = false;
            this.log.debug("Running onDisconnect callbacks...");
            for (const callback of this.onDisconnectCallbacks) {
                callback();
            }
        };

        this.connection.onConnect = () => {
            this.connectionReady = true;
            for (const callback of this.onConnectCallbacks) {
                callback();
            }
        };
    }

    connect(callback?: () => void) {
        this.connection.connect(() => {
            this.connectionReady = true;

            if (callback) {
                callback();
            }
        });
    }

    public addOnConnectCallback(callback: () => void) {
        this.onConnectCallbacks.push(callback);
    }

    public addOnDisconnectCallback(callback: () => void) {
        this.onDisconnectCallbacks.push(callback);
    }

    async sendMessage(message: string, callbackChars?: string, callback?: (error: any, response: string) => void) {
        return this.connection.sendMessage(message, callbackChars, callback);
    }

    public displayChanged(message: string) {
        this.log.debug('[DISPLAY] ' + message);
    }

    public fallbackOnData(error: any, message: string, callback?: Function) {
        this.onData(error, message, callback);
    }
}
