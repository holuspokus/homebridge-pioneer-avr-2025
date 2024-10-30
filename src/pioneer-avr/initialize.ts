// src/pioneer-avr/initialize.ts

let allInterval: NodeJS.Timeout; // oder einfach 'let allInterval;' für den Fall, dass du es erst später initialisierst
let lastUserInteraction: number | null = null; // Initialisiere es mit null, falls es zu Beginn nicht gesetzt ist

import { AVState } from './pioneerAvr'; // Importiere AVState direkt
import { TelnetAvr } from '../telnet-avr/telnetAvr'; // Importiere TelnetAvr
import { onDataHandler } from './onDataHandler'; // Importiere onDataHandler

export const initialize = async function() {
    // Implementation of the initialize function here
    this.log.debug('Initializing Pioneer AVR...');

    // Initialize instance variables
    this.inputs = [];
    this.web = false;
    this.webStatusUrl = `http://${this.host}/StatusHandler.asp`;
    this.webEventHandlerBaseUrl = `http://${this.host}/EventHandler.asp?WebToHostItem=`;
    this.state = {
        volume: 30,
        on: false,
        muted: true,
        input: 0,
        listeningMode: null,
        listeningModeLM: null,
        lastGetPowerStatus: null
    };

    // Set up the onData handler
    this.onData = onDataHandler(this);

    // Web interface check
    try {
        const response = await fetch(`${this.webEventHandlerBaseUrl}PO`, { method: 'GET' });
        if (response.status === 200) {
            this.log.info("Web Interface enabled");
            this.web = true;
        }
    } catch (e) {
        this.log.debug('Check web enabled ERROR', e);
    }

    // Communication Initialization
    this.telnetAvr = new TelnetAvr(this.host, this.port, this.log);
    this.telnetAvr.fallbackOnData = this.onData;

    try {
        this.telnetAvr.connect();
    } catch (e) {
        this.log.debug('Pioneer AVR connection error', e);
    }

    this.log.debug("Wait until telnet connected");

    // Handle disconnection
    this.telnetAvr.onDisconnect = () => {
        this.state.on = false;
        // Logic for handling disconnection
        // For example:
        console.log("Disconnected! Performing cleanup...");

        setTimeout(() => {
            try {
                this.functionSetPowerState(this.state.on);
            } catch (e) {
                console.error("Error setting power state:", e);
            }
        }, 2);

        setTimeout(() => {
            try {
                this.functionSetLightbulbVolume(this.state.volume);
            } catch (e) {
                console.error("Error setting lightbulb volume:", e);
            }
        }, 2);
    };

    // Handle connection
    this.telnetAvr.onConnect = async () => {
        this.powerStatus(() => {});

        if (this.telnetAvr.connectionReady) {
            this.log.info("Telnet connected");
            await new Promise(resolve => setTimeout(resolve, 50));
            await this.__updateListeningMode(() => {});

            await this.sendCommand("0PKL");
            await new Promise(resolve => setTimeout(resolve, 250));
            await this.sendCommand("0RML");

            await this.__updateInput(() => {});
            await this.__updateVolume(() => {});
            await this.__updateMute(() => {});

            setTimeout(() => {
                try {
                    let runThis = this.pioneerAvrClassCallback.bind(this)
                    runThis();
                } catch (e) {
                    this.log.debug("connectionReadyCallback() Error", e);
                }
            }, 500);

            try {
                this.functionSetPowerState(this.state.on);
            } catch (e) {
                console.error("Error setting power state:", e);
            }

            try {
                this.functionSetLightbulbVolume(this.state.volume);
            } catch (e) {
                console.error("Error setting lightbulb volume:", e);
            }
        }
    };

    // Input initialization handling
    this.initCount = 0;
    this.isReady = false;

    // Display change handling
    this.telnetAvr.displayChanged = (error: any, text: string) => {
        if (error) {
            this.log.error(error);
        }
        if (text) {
            this.log.debug("[DISPLAY] " + text);
        }
    };

    // Polling for updates
    clearInterval(allInterval);
    allInterval = setInterval(async () => {
        try {
            if (lastUserInteraction !== null && Date.now() - lastUserInteraction > (48 * 60 * 60 * 1000)) {
                return;
            }
            if (
                this.telnetAvr.connectionReady &&
                this.isReady &&
                this.state.on &&
                this.state.lastGetPowerStatus !== null
            ) {
                this.__updateVolume(() => {});
            }
            if (this.isReady && this.telnetAvr.connectionReady) {
                this.__updatePower(() => {});
            }
        } catch (e) {
            this.log.debug("Polling error", e);
        }
    }, 29000);

};
