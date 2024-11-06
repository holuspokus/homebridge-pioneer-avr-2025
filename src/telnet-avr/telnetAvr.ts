// src/telnet-avr/telnetAvr.ts

import { Connection } from "./connection";

const PORT = 23;
const HOST = "127.0.0.1";

export class TelnetAvr {
    private log: any;
    protected connection: Connection;
    private dataHandler: DataHandler;
    public onData: (error: any, data: string, callback?: Function) => void = () => {};
    private onDisconnectCallbacks: Array<() => void> = []; // Liste für onDisconnect-Callbacks
    private onConnectCallbacks: Array<() => void> = []; // Callbacks für onConnect
    public connectionReady = false;



    constructor(private host: string = HOST, private port: number = PORT, private log: any) {
        this.log = log;


        this.connection = new Connection(this.host, this.port, this.log);

        // Bind the TelnetAvr's onData to Connection
        // Set up onDataCallback to always reference the current onData function
        this.connection.onDataCallback = (error: any, data: string, callback?: Function) => {
            this.onData(error, data, callback); // Use the current onData method
        };

        this.connection.onDisconnect = () => {
            this.connectionReady = false
            this.log.debug("Running onDisconnect callbacks...");
            for (const callback of this.onDisconnectCallbacks) {
                callback();
            }
        };

        this.connection.onConnect = () => {
            this.connectionReady = true
            this.log.info("Running onConnect callbacks...");
            for (const callback of this.onConnectCallbacks) {
                callback();
            }
        };
    }

    connect(callback?: () => void) {
        this.connection.connect(() => {
            this.log.info("Telnet> Connected!");
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

    async sendMessage(message: string, callbackChars?: string, onData?: (error: any, response: string) => void) {
        return this.connection.sendMessage(message, callbackChars, onData);
    }

    public displayChanged(error: any, message: string) {
        this.log.debug('[DISPLAY] ' + message);
    }
}
