// src/pioneer-avr/volume.ts

import PioneerAvr from './pioneerAvr';

export const volumeMethods = (pioneerAvr: PioneerAvr) => {
    pioneerAvr.__updateVolume = async function(callback) {
        this.s.connection.sendMessage("?V", "VOL", callback); // Direkter Aufruf von sendMessage
    };

    pioneerAvr.volumeStatus = function(callback) {
        if (this.state.volume !== null) {
            callback(null, this.state.volume);
            return;
        }

        this.__updateVolume(() => {
            callback(null, this.state.volume);
        });
    };

    pioneerAvr.setVolume = function(targetVolume, callback) {
        if (!this.s || !this.s.connection.connectionReady || !this.state.on) {
            return;
        }

        targetVolume = parseInt(targetVolume, 10);

        if (isNaN(targetVolume) || Math.floor(targetVolume) === this.state.volume) {
            callback();
            return;
        }

        let vsxVol = 0;

        // Volume calculation based on min and max volume
        if (this.maxVolumeSet > 0) {
            const minVolumeIn185 = (this.minVolumeSet / 100) * 185;
            const maxVolumeIn185 = (this.maxVolumeSet / 100) * 185;
            vsxVol = ((targetVolume / 100) * (maxVolumeIn185 - minVolumeIn185)) + minVolumeIn185;
        } else {
            vsxVol = (targetVolume * 185) / 100; // Fallback
        }

        vsxVol = Math.floor(vsxVol);
        const vsxVolStr = vsxVol.toString().padStart(3, '0'); // Pad to 3 digits

        this.s.connection.sendMessage(`${vsxVolStr}VL`, undefined, callback); // Direkter Aufruf von sendMessage

        // Update last user interaction
        this.lastUserInteraction = Date.now();
    };

    // Weitere Methoden wie volumeUp, volumeDown usw.
};
