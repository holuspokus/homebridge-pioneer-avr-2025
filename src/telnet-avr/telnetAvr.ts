// src/telnet-avr/telnetAvr.ts

import { Connection } from './connection';
import type PioneerAvr from '../pioneer-avr/pioneerAvr';

export class TelnetAvr {
    public readonly connection: Connection;
    public onData: (error: any, data: string, callback?: Function) => void =
        () => {};

    private onDisconnectCallbacks: (() => void)[] = []; // List for onDisconnect callbacks
    private onConnectCallbacks: (() => void)[] = []; // Callbacks for onConnect
    public connectionReady = false;
    public host: string;
    public port: number;
    public log: any;
    public avr: PioneerAvr;
    public device: any;
    public platform: any;

    constructor(pioneerAvr: any) {
        // Use the properties from the passed-in PioneerAvr instance
        this.host = pioneerAvr.host;
        this.port = pioneerAvr.port;
        this.log = pioneerAvr.log;
        this.avr = pioneerAvr;
        this.device = pioneerAvr.device;
        this.platform = pioneerAvr.platform;

        this.connection = new Connection(this);

        this.connection.onDisconnect = () => {
            this.connectionReady = false;
            this.log.debug('Running onDisconnect callbacks...');
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

    async sendMessage(
        message: string,
        callbackChars?: string,
        callback?: (error: any, response: string) => void,
    ) {
        return this.connection.sendMessage(message, callbackChars, callback);
    }

    public displayChanged(message: string) {
        this.log.debug('[DISPLAY] ' + message);
    }

    public fallbackOnData(error: any, message: string, callback?: Function) {
        this.onData(error, message, callback);
    }

    public onDisconnect(): void {
        this.connection.onDisconnect();
    }

    public onConnect(): void {
        this.connection.onConnect();
    }
}
