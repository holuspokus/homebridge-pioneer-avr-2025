// src/discovery.ts

import * as net from 'net';
import bonjour from 'bonjour'; // Bonjour for mDNS discovery

// Main function to discover devices using mDNS (Bonjour) only
async function findDevices(targetName: string, telnetPorts: number[], log: any, maxDevices: number = Infinity): Promise<{ name: string; origName: string; host: string; port: number; source: string; }[]> {
    const devices: { name: string; origName: string; host: string; port: number; source: string; maxVolume?: number; minVolume?: number; }[] = [];
    const bonjourService = bonjour();
    log.debug("Searching for Pioneer Receivers via Bonjour...");

    // Discover Bonjour devices with a dynamic stop condition
    await discoverBonjourDevices(targetName, devices, telnetPorts, log, bonjourService, maxDevices);

    // Return the list of devices after Bonjour search completes
    return devices;
}

// mDNS (Bonjour) Discovery with port check
async function discoverBonjourDevices(
    targetName: string,
    devices: { name: string; origName: string; host: string; port: number; source: string; maxVolume?: number; minVolume?: number; }[],
    telnetPorts: number[],
    log: any,
    bonjourService: any,
    maxDevices: number
) {
    let hostsFound: string[] = [];
    return new Promise<void>((resolve) => {
        bonjourService.find({ type: 'raop' }, (service) => {
          // {
          //     addresses: [ '192.168.1.99' ],
          //     name: '746E1B312D68@VSX-923',
          //     fqdn: '746E1B312D68@VSX-923._raop._tcp.local',
          //     host: 'VSX-923.local',
          //     port: 1024,
          //     type: 'raop',
          //     protocol: 'tcp',
          //     subtypes: [],
          //     rawTxt: <Buffer 09 74 78 74 76 65 72 73 3d 31 04 63 68 3d 32 06 63 6e 3d 30 2c 31 07 64 61 3d 74 72 75 65 06 65 74 3d 30 2c 34 0c 66 74 3d 30 78 34 34 46 38 41 30 30 ... 97 more bytes>,
          //     txt: {
          //         txtvers: '1',
          //         ch: '2',
          //         cn: '0,1',
          //         da: 'true',
          //         et: '0,4',
          //         ft: '0x44F8A00',
          //         md: '0,1,2',
          //         pw: 'false',
          //         sv: 'false',
          //         sr: '44100',
          //         ss: '16',
          //         tp: 'UDP',
          //         vn: '65537',
          //         vs: '141.9',
          //         am: 'VSX-923',
          //         fv: 's9294.4003.1106'
          //       }
          //   }

            let origName = ''

            if (service.name) {
                origName = String(service.name)
            }

            let serviceString = 'oops!';
            try {
                serviceString = JSON.stringify(service, null, 2);
            } catch (error) {
                log.debug("Failed to convert object to string:", error);
                if (service.name) {
                    serviceString = service.name
                }
            }
            if (serviceString.toLowerCase().includes(targetName.toLowerCase())) {

                if (devices.length >= maxDevices) {
                    bonjourService.destroy();
                    resolve();
                    return;
                }

                if (service.name) {
                  service.name = service.name.replace(/\.local$/, '');
                  service.name = service.name.includes('@') ? service.name.split('@')[1] : service.name
                }

                // Function to find the first available IP address in the service object
                function findIp(service: any): string | null {
                    for (const key in service) {
                        if (typeof service[key] === 'string' && service[key].match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
                            return service[key];
                        }
                        if (Array.isArray(service[key])) {
                            const ip = service[key].find((item: string) => item.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/));
                            if (ip) return ip;
                        }
                    }
                    return null;
                }

                // Function to find a name field in the service object, extracting the part after '@' if present, or using 'host' as a fallback
                function findName(service: any): string | null {
                    for (const key in service) {
                        if (key.toLowerCase() === 'name' && typeof service[key] === 'string') {
                            const name = service[key];
                            // Check if '@' is in the name, and return the part after it if present
                            return name.includes('@') ? name.split('@')[1] : name;
                        }
                    }

                    // Fallback to 'host' if 'name' is not present or doesn't contain '@'
                    if (service.host && typeof service.host === 'string') {
                        // Remove '.local' from the host name if present
                        return service.host.replace(/\.local$/, '');
                    }

                    return null;
                }



                // Attempt to retrieve IP and name with direct assignment and fallbacks
                const host = service.host || service.referer?.address || (Array.isArray(service.addresses) ? service.addresses[0] : findIp(service));
                const name = service.name || findName(service) || service.host || service.fqdn || host;

                if (hostsFound.indexOf(host) === -1) {
                    hostsFound.push(host);
                    checkPorts(host, name, origName, telnetPorts, 'bonjour', log).then((device) => {
                        if (device && !devices.some(d => d.host === device.host && d.port === device.port)) {
                            devices.push(device);
                            log.debug(`Device with open port found: ${device.name} at ${device.host}:${device.port}`);
                        }

                        // Stop search if the max number of devices has been found
                        if (devices.length >= maxDevices) {
                            bonjourService.destroy();
                            resolve();
                        }
                    });
                }
            }
        });

        // Set a timeout to automatically stop the search if it takes too long
        setTimeout(() => {
            if (devices.length >= 1) {
                bonjourService.destroy();
                resolve();
            }else{
                setTimeout(() => {
                    // Stop search if one devices has been found
                    if (devices.length >= 1) {
                        bonjourService.destroy();
                        resolve();
                    }else{
                        setTimeout(() => {
                            bonjourService.destroy();
                            resolve();
                        }, 29000);
                    }
                }, 1000);
            }
        }, 500);
    });
}

// Check specific ports for open connections on each device
async function checkPorts(host: string, name: string, origName: string, ports: number[], source: string, log: any): Promise<{ name: string; origName: string; host: string; port: number; source: string; } | null> {
    for (const port of ports) {
        if (await isPortOpen(host, port, log)) {
            return { name, origName, host, port, source }; // Return device info if port is open
        }
    }
    return null;
}

// Utility to check if a specific port on a device is open, with a connection attempt
async function isPortOpen(host: string, port: number, log: any): Promise<boolean> {
    log.debug(`Checking if port ${port} on host ${host} is open`);

    return new Promise((resolve) => {
        const socket = new net.Socket();
        let isConnectionOpen = false;

        // Set a 10-second timeout for the entire operation
        socket.setTimeout(10000);

        // Attempt to connect and check if we can access the port via Telnet
        socket.connect(port, host, () => {
            log.debug(`Port ${port} on Host ${host} responded; attempting to close connection.`);
            socket.end(); // Close the connection
            isConnectionOpen = true;
        });

        // Event: Successful connection and closure
        socket.on('close', () => {
            resolve(isConnectionOpen);
        });

        // Event: Error in connection attempt (port likely closed)
        socket.on('error', (err) => {
            log.debug(`Error accessing port ${port} on Host ${host}: ${err.message}`);
            resolve(false);
        });

        // Event: Connection timed out
        socket.on('timeout', () => {
            log.debug(`Timeout reached when checking port ${port} on Host ${host}`);
            socket.destroy();
            resolve(false);
        });
    });
}

export { findDevices };
