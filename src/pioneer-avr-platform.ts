// src/pioneer-avr-platform.ts

import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { findDevices } from './discovery';
import PioneerAvrAccessory from './pioneer-avr-accessory.js';
import * as fs from 'fs';
import * as path from 'path';
import packageJson from "../package.json"; // Import package.json

type Device = {
    name: string;
    origName: string;
    host: string;
    port: number;
    source: string;
    maxVolume?: number;
    minVolume?: number;
};

/**
 * PioneerAvrPlatform
 * This class serves as the main entry point for the plugin, where user configuration is parsed,
 * accessories are registered, and discovered devices are managed.
 */
export class PioneerAvrPlatform implements DynamicPlatformPlugin {
  public readonly service: typeof Service;
  public readonly characteristic: typeof Characteristic;
  private platformName: string;
  private pluginName: string;

  // Used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // Configuration constants as instance variables
  private readonly TELNET_PORTS = [23, 24, 8102];
  private readonly TARGET_NAME = "VSX";
  private readonly MAX_ATTEMPTS = 1000;
  private readonly RETRY_DELAY = 10000; // 10 seconds in milliseconds

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.service = this.api.hap.Service;
    this.characteristic = this.api.hap.Characteristic;

    let platformName = packageJson.platformName || 'pioneerAvr2025';
    platformName = platformName.replace(/[^a-zA-Z0-9 ']/g, '');
    platformName = platformName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

    let pluginName = packageJson.name || 'homebridge-pioneer-avr-2025';
    pluginName = pluginName.replace(/[^a-zA-Z0-9 \-']/g, '');
    pluginName = pluginName.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

    this.platformName = platformName || 'pioneerAvr2025';
    this.pluginName = pluginName || 'homebridge-pioneer-avr-2025';

    this.log.debug('Platform started:', this.platformName, this.pluginName);

    if (config.device?.port && !this.TELNET_PORTS.includes(parseInt(config.device.port, 10))) {
        this.TELNET_PORTS.unshift(parseInt(config.device.port, 10))
    }

    if (config.port && !this.TELNET_PORTS.includes(parseInt(config.port, 10))) {
        this.TELNET_PORTS.unshift(parseInt(config.port, 10))
    }

    if (config.devices && Array.isArray(config.devices) && config.devices.length > 0){
        for (const device of config.devices) {
            if (device.port  && !this.TELNET_PORTS.includes(parseInt(device.port, 10)) ) {
                this.TELNET_PORTS.unshift(parseInt(device.port, 10))
            }
        }
    }

    // Register for the 'didFinishLaunching' event to start device discovery after Homebridge startup
    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  /**
   * Invoked when Homebridge restores cached accessories from disk at startup.
   * Sets up event handlers for each cached accessory.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Initiates the device discovery process or uses a manually configured device.
   * Attempts up to MAX_ATTEMPTS times if no devices are found, with a delay of RETRY_DELAY between attempts.
   */
  async discoverDevices() {
    const devicesFound: any[] = [];
    let needsRestart: boolean = false;

    // Check if the device is manually configured, bypassing discovery
    if (this.config && this.config?.devices && Array.isArray(this.config?.devices) && this.config.devices.length > 0) {
        for (const device of this.config.devices) {

            if (device && (device.host || device.ip) && String(device.host || device.ip).length > 0) {
                let addDevice: Device = {
                    name: device.name || String(device.host || device.ip).replace(/\.local$/, '').replace(/[^a-zA-Z0-9 ]/g, ""),
                    origName: device.name || String(device.host || device.ip).replace(/\.local$/, '').replace(/[^a-zA-Z0-9 ]/g, ""),
                    host: device.host || device.ip,
                    port: device.port || 23,
                    source: 'pluginConfig'
                };

                if (device.minVolume) {
                    addDevice.minVolume = device.minVolume;
                }

                if (device.maxVolume) {
                    addDevice.maxVolume = device.maxVolume;
                }

                devicesFound.push(addDevice);
            }
        }

        this.log.debug('Using manually configured devices:', devicesFound);
    } else if (this.config && this.config?.device && (this.config.device.host || this.config.device.ip) && String(this.config.device.host || this.config.device.ip).length > 0 && this.config.device.port) {

      let addDevice: Device = {
        name: this.config.device.name || String(this.config.device.host || this.config.device.ip).replace(/\.local$/, '').replace(/[^a-zA-Z0-9 ]/g, ""),
        origName: this.config.device.name || String(this.config.device.host || this.config.device.ip).replace(/\.local$/, '').replace(/[^a-zA-Z0-9 ]/g, ""),
        host: this.config.device.host || this.config.device.ip,
        port: this.config.device.port || 23,
        source: 'pluginConfig'
      };

      if (this.config.device.minVolume) {
          addDevice.minVolume = this.config.device.minVolume;
      }

      if (this.config.device.maxVolume) {
          addDevice.maxVolume = this.config.device.maxVolume;
      }

      devicesFound.push(addDevice);

      this.log.debug('Using manually configured device:', devicesFound);
    } else if (this.config && (this.config.host || this.config.ip) && String(this.config.host || this.config.ip).length > 0) {
      let addDevice: Device = {
          name: this.config.name || String(this.config.host || this.config.ip).replace(/\.local$/, '').replace(/[^a-zA-Z0-9 ]/g, ""),
          origName: this.config.name || String(this.config.host || this.config.ip).replace(/\.local$/, '').replace(/[^a-zA-Z0-9 ]/g, ""),
          host: this.config.host || this.config.ip,
          port: this.config.port || 23,
          source: 'pluginConfig'
      };

      devicesFound.push(addDevice);
      this.log.debug('Using manually configured device:', devicesFound);
    } else {
      const homebridgeConfigPath = path.join(this.api.user.storagePath(), 'config.json');

      try {
        // Load the config.json file
        const homebridgeConfig: any = JSON.parse(fs.readFileSync(homebridgeConfigPath, 'utf8'));

        // Check if "pioneerAvrAccessory" exists in accessories
        const pioneerAccessory = homebridgeConfig.accessories?.find(
          (accessory: any) => accessory.accessory === 'pioneerAvrAccessory'
        );

        // Check if "pioneerAvr2025" platform already exists
        let pioneerPlatform = homebridgeConfig.platforms.find(
          (platform: any) => platform.name === this.platformName
        );

        // If not found, create the platform entry
        if (!pioneerPlatform) {
          pioneerPlatform = { name: this.platformName, platform: this.platformName };
          homebridgeConfig.platforms.push(pioneerPlatform);
        }

        if (pioneerAccessory && pioneerAccessory.name && pioneerAccessory.host && pioneerAccessory.port) {

          let addDevice: Device = {
            name: pioneerAccessory.name,
            origName: pioneerAccessory.name,
            host: pioneerAccessory.host,
            port: pioneerAccessory.port,
            source: 'pioneerAccessory'
          };

          if (pioneerAccessory.minVolume) {
              addDevice.minVolume = pioneerAccessory.minVolume;
          } else if (pioneerAccessory.minVolumeSet) {
              addDevice.minVolume = pioneerAccessory.minVolumeSet;
          }

          if (pioneerAccessory.maxVolume) {
              addDevice.maxVolume = pioneerAccessory.maxVolume;
          } else if (pioneerAccessory.maxVolumeSet) {
              addDevice.maxVolume = pioneerAccessory.maxVolumeSet;
          }

          devicesFound.push(addDevice);
          this.log.debug('Found pioneerAvrAccessory in config.json.', devicesFound);

          // Ensure the platforms array exists
          homebridgeConfig.platforms = homebridgeConfig.platforms || [];

          // Add the "device" entry
          if (!pioneerPlatform.device || !pioneerPlatform.device.name || !pioneerPlatform.device.host){
            pioneerPlatform.device = {
              host: pioneerAccessory.host,
              port: pioneerAccessory.port,
              name: pioneerAccessory.name
            };
            needsRestart = true;
          }

          this.log.info('Updated "' + this.platformName + '" platform in config.json with device info from "pioneerAvrAccessory".');
        }

        // Move _bridge settings from old config
        if (pioneerAccessory && pioneerAccessory._bridge) { // && !this.config._bridge
          pioneerPlatform._bridge = pioneerAccessory._bridge;
          needsRestart = true;
        }

        if (pioneerAccessory && pioneerAccessory.maxVolume) {
          pioneerPlatform.maxVolume = pioneerAccessory.maxVolume;
          needsRestart = true;
        }

        if (pioneerAccessory && pioneerAccessory.minVolume) {
          pioneerPlatform.minVolume = pioneerAccessory.minVolume;
          needsRestart = true;
        }

        // Remove all "pioneerAvrAccessory" entries from accessories
        if (Array.isArray(homebridgeConfig.accessories)) {
          const originalLength = homebridgeConfig.accessories.length;
          homebridgeConfig.accessories = homebridgeConfig.accessories.filter(
            (accessory: any) => accessory.accessory !== 'pioneerAvrAccessory'
          );

          if (homebridgeConfig.accessories.length !== originalLength) {
            this.log.debug('Removed "pioneerAvrAccessory" entries from config.json.');
            needsRestart = true;
          }
        }

        // Save the updated config.json
        fs.writeFileSync(homebridgeConfigPath, JSON.stringify(homebridgeConfig, null, 2), 'utf8');
        this.log.debug('Saved updated config.json.');

        if (needsRestart) {
          console.log(JSON.stringify(homebridgeConfig, null, 2));
          console.error('PLEASE RESTART HOMEBRIDGE');
          console.error('PLEASE RESTART HOMEBRIDGE');
          console.error('PLEASE RESTART HOMEBRIDGE');
          process.exit();
          return;
        }
      } catch (error) {
        this.log.error('Error updating config.json for pioneerAvrAccessory:', error);
      }

      let attempts = 0;

      // Retry discovery up to MAX_ATTEMPTS times if no devices are found
      while (attempts < this.MAX_ATTEMPTS && devicesFound.length === 0) {
        attempts++;
        const maxDevices = 5;
        const discoveredDevices = await findDevices(this.TARGET_NAME, this.TELNET_PORTS, this.log, maxDevices);

        // If devices are found, add them to devicesFound and exit loop
        if (discoveredDevices.length > 0) {
          for (const dDevice of discoveredDevices) {
              devicesFound.push({
                name: dDevice.name,
                origName: dDevice.origName,
                host: dDevice.host,
                port: dDevice.port,
                source: dDevice.source
              });
          }
          this.log.debug('Discovered devices:', devicesFound);
          break;
        }

        // Log warning and wait before next attempt if no devices were found
        this.log.warn(`Attempt ${attempts} of ${this.MAX_ATTEMPTS}: No devices found. Retrying in ${this.RETRY_DELAY / 1000} seconds...`);
        if (attempts < this.MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        }
      }

      // Log error if all attempts failed and no devices were found
      if (devicesFound.length === 0) {
        this.log.error('No devices found after maximum retry attempts. Please configure manually.');
        return;
      }
    }

    // Process each device found or manually configured
    await this.loopDevices(devicesFound);
  }

  /**
   * Processes each discovered or manually configured device asynchronously.
   * Registers or restores devices in Homebridge as necessary.
   *
   * @param foundDevices - List of devices found during discovery or configured manually
   */
  async loopDevices(foundDevices: any[]) {
    for (const foundDevice of foundDevices) {
      // this.log.debug('Processing device:', foundDevice);

      try {
        // Generate a unique name to avoid duplicate accessory names in Homebridge
        let uniqueName = foundDevice.name.replace(/[^a-zA-Z0-9]/g, "");
        let counter = 1;

        if (foundDevices.length > 1) {
          // Check if another accessory with the same name already exists
          while (foundDevices.some(fd => fd.name === uniqueName)) {
            uniqueName = `${foundDevice.name}_${counter}`;
            counter++;
          }
        }

        // Log the renaming if necessary
        if (uniqueName !== foundDevice.name.replace(/[^a-zA-Z0-9]/g, "")) {
          this.log.warn(`Device with name "${foundDevice.name.replace(/[^a-zA-Z0-9]/g, "")}" already exists. Renaming to "${uniqueName}".`);
        }

        // Generate a unique identifier (UUID) for the accessory based on device information
        const uuid = this.api.hap.uuid.generate(String(uniqueName) + String(foundDevice.host));

        // Check if an accessory with this UUID is already registered in Homebridge
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // Restore the existing accessory from cache
          this.log.debug('Restoring existing accessory from cache:', existingAccessory.displayName);
          new PioneerAvrAccessory(foundDevice, this, existingAccessory);
        } else {
          this.log.debug('Adding new accessory:', uniqueName, foundDevice.host, foundDevice.port);

          // Initialize a new accessory instance with the unique name and set device context
          const accessory = new this.api.platformAccessory(uniqueName, uuid);
          accessory.context.device = { ...foundDevice, name: uniqueName };

          // Initialize the accessory and wait for it to be ready
          new PioneerAvrAccessory(foundDevice, this, accessory);

          // Register the accessory with Homebridge once it is fully initialized
          this.api.registerPlatformAccessories(this.pluginName, this.platformName, [accessory]);
        }

      } catch (e) {
        this.log.debug('Error processing device in loopDevices:', e);
      }
    }
  }
}
