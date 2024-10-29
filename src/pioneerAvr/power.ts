import fetch from "node-fetch";
import PioneerAvr from './pioneerAvr';

export const powerMethods = (pioneerAvr: PioneerAvr) => {
    pioneerAvr.__updatePower = async function (callback: () => void) {
        this.s.connection.sendMessage("?P", "PWR", callback); // Direkter Aufruf von sendMessage
    };

    pioneerAvr.powerStatus = async function (callback: (err: any, status?: boolean) => void) {
        if (this.state.on !== null) {
            try {
                callback(null, this.state.on);
            } catch (e) {
                this.log.debug("powerStatus", e);
            }
            return;
        }

        this.__updatePower(() => {
            try {
                callback(null, this.state.on);
            } catch (e) {
                this.log.debug("powerStatus2", e);
            }
        });
    };

    pioneerAvr.powerOn = async function () {
        this.log.debug("Power on");

        if (this.web) {
            await fetch(this.webEventHandlerBaseUrl + "PO", { method: 'GET' });
        } else {
            this.s.connection.sendMessage("PO"); // Direkter Aufruf von sendMessage
        }
        this.lastUserInteraction = Date.now();  // Sicherstellen, dass 'lastUserInteraction' korrekt referenziert wird
        setTimeout(() => {
            this.powerStatus(() => {});
        }, 500);
    };

    pioneerAvr.powerOff = async function () {
        this.log.debug("Power off");

        if (this.web) {
            await fetch(this.webEventHandlerBaseUrl + "PF", { method: 'GET' });
        } else {
            this.s.connection.sendMessage("PF"); // Direkter Aufruf von sendMessage
        }
        this.lastUserInteraction = Date.now();  // Sicherstellen, dass 'lastUserInteraction' korrekt referenziert wird
        setTimeout(() => {
            this.powerStatus(() => {});
        }, 500);
    };
};
