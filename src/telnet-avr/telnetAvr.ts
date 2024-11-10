// src/telnet-avr/telnetAvr.ts

import { Connection } from "./connection";

const PORT = 23;
const HOST = "127.0.0.1";

export class TelnetAvr {
    public readonly connection: Connection;
    public onData: (error: any, data: string, callback?: Function) => void = () => {};
    private onDisconnectCallbacks: Array<() => void> = []; // Liste für onDisconnect-Callbacks
    private onConnectCallbacks: Array<() => void> = []; // Callbacks für onConnect
    public connectionReady = false;



    constructor(public readonly host: string = HOST, public readonly port: number = PORT, public readonly log: any) {
        this.log = log;


        this.connection = new Connection(this);

        this.connection.onDisconnect = () => {
            this.connectionReady = false
            this.log.debug("Running onDisconnect callbacks...");
            for (const callback of this.onDisconnectCallbacks) {
                callback();
            }
        };

        this.connection.onConnect = () => {
            this.connectionReady = true
            // this.log.debug("Running onConnect callbacks...");
            for (const callback of this.onConnectCallbacks) {
                callback();
            }
        };
    }

    connect(callback?: () => void) {
        this.connection.connect(() => {
            // this.log.debug("Telnet> Connected!");
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
        // this.log.debug('telnet sendMessage>', message)
        return this.connection.sendMessage(message, callbackChars, callback);
    }

    public displayChanged(message: string) {
        this.log.debug('[DISPLAY] ' + message);
    }

    public fallbackOnData(error: any, message: string, callback?: Function) {
        this.onData(error, message, callback);
    }
}
