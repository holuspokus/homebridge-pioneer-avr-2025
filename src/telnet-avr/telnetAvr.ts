// src/telnet-avr/telnetAvr.ts

import { Connection } from "./connection";
import { DataHandler } from "./dataHandler"; // Importiere die neue Klasse

const PORT = 23;
const HOST = "127.0.0.1";

class TelnetAvr {
    protected connection: Connection;
    private dataHandler: DataHandler; // Neue Instanz der DataHandler-Klasse

    constructor(private host: string = HOST, private port: number = PORT, private log: any) {
        this.connection = new Connection(this.host, this.port);
        this.dataHandler = new DataHandler(); // Initialisiere den DataHandler
    }

    connect(callback: () => void) {
        this.connection.connect(() => {
            this.log.info("Telnet> Connected!");
            this.connection.onData = (data) => this.dataHandler.handleData(data); // Setze den onData-Handler
            callback();
        });
    }

    sendMessage(message: string) {
        this.connection.sendMessage(message);
    }
}

export default TelnetAvr;
