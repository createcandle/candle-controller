/**
 * Raspbian platform interface.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


import child_process from 'child_process';
import fs from 'fs';
import ipRegex from 'ip-regex';
import os from 'os';
import ip from 'ip';
import { Netmask } from 'netmask';
import BasePlatform from './base';
import NetworkManager, { ConnectionSettings } from './utilities/network-manager';
import {
  LanMode,
  NetworkAddresses,
  SelfUpdateStatus,
  WirelessMode,
  WirelessNetwork,
} from './types';


export class LinuxRaspbianPlatform extends BasePlatform {

  getDhcpServerStatus(): boolean {
    const proc = child_process.spawnSync('systemctl', ['is-active', 'dnsmasq.service']);
    return proc.status === 0;
  }

  /**
   * Set DHCP server status.
   *
   * @param {boolean} enabled - Whether or not to enable the DHCP server
   * @returns {boolean} Boolean indicating success of the command.
   */
  setDhcpServerStatus(enabled: boolean): boolean {
    let proc = child_process.spawnSync('sudo', [
      'systemctl',
      enabled ? 'start' : 'stop',
      'dnsmasq.service',
    ]);
    if (proc.status !== 0) {
      return false;
    }

    proc = child_process.spawnSync('sudo', [
      'systemctl',
      enabled ? 'enable' : 'disable',
      'dnsmasq.service',
    ]);
    return proc.status === 0;
  }

  /**
   * Get the LAN mode and options.
   *
   * @returns {Object} {mode: 'static|dhcp|...', options: {...}}
   */
  getLanMode(): LanMode {
    let mode = 'static';
    const options: Record<string, unknown> = {};

    if (!fs.existsSync('/etc/network/interfaces.d/eth0')) {
      mode = 'dhcp';
      return { mode, options };
    }

    const data = fs.readFileSync('/etc/network/interfaces.d/eth0', 'utf8');
    for (const line of data.trim().split('\n')) {
      const parts = line
        .trim()
        .split(' ')
        .filter((s) => s.length > 0);

      switch (parts[0]) {
        case 'iface':
          mode = parts[3];
          break;
        case 'address':
          options.ipaddr = parts[1];
          break;
        case 'netmask':
          options.netmask = parts[1];
          break;
        case 'gateway':
          options.gateway = parts[1];
          break;
        case 'dns-nameservers':
          options.dns = parts.slice(1);
          break;
      }
    }

    return { mode, options };
  }

  /**
   * Set the LAN mode and options.
   *
   * @param {string} mode - static, dhcp, ...
   * @param {Object?} options - options specific to LAN mode
   * @returns {boolean} Boolean indicating success.
   */
  setLanMode(mode: 'static' | 'dhcp', options: Record<string, unknown> = {}): boolean {
    const valid = ['static', 'dhcp'];
    if (!valid.includes(mode)) {
      return false;
    }

    const regex = ipRegex({ exact: true });
    if (
      (options.ipaddr && !regex.test(<string>options.ipaddr)) ||
      (options.netmask && !regex.test(<string>options.netmask)) ||
      (options.gateway && !regex.test(<string>options.gateway)) ||
      (options.dns && (<string[]>options.dns).filter((d: string) => !regex.test(d)).length > 0)
    ) {
      return false;
    }

    let entry = `auto eth0\niface eth0 inet ${mode}\n`;
    if (options.ipaddr) {
      entry += `    address ${options.ipaddr}\n`;
    }
    if (options.netmask) {
      entry += `    netmask ${options.netmask}\n`;
    }
    if (options.gateway) {
      entry += `    gateway ${options.gateway}\n`;
    }
    if (options.dns) {
      entry += `    dns-nameservers ${(<string[]>options.dns).join(' ')}\n`;
    }

    fs.writeFileSync('/tmp/eth0', entry);

    let proc = child_process.spawnSync('sudo', ['mv', '/tmp/eth0', '/etc/network/interfaces.d/']);

    if (proc.status !== 0) {
      return false;
    }

    if (fs.existsSync('/usr/lib/systemd/system/NetworkManager.service')) {
        proc = child_process.spawnSync('sudo', ['systemctl', 'restart', 'NetworkManager.service']);
    }
    else{
        proc = child_process.spawnSync('sudo', ['systemctl', 'restart', 'networking.service']);
        
    }
    return proc.status === 0;
    
  }

  /**
   * Get the wireless mode and options.
   *
   * @returns {Object} {enabled: true|false, mode: 'ap|sta|...', options: {...}}
   */
  getWirelessMode(): WirelessMode {
    let enabled = false,
      mode = '',
      cipher = '',
      mgmt = '';
    const options: Record<string, unknown> = {};

    let dev_name = 'wlan0'; 
    var wifi_dev_name_check_output = child_process.spawnSync("ifconfig", ["|","grep","'mlan0:'"], { shell: true, encoding: 'utf8' });
    if(wifi_dev_name_check_output.stdout.indexOf('mlan0:') != -1){
      dev_name = 'mlan0';
    }
    let proc = child_process.spawnSync('systemctl', ['is-active', 'hostapd.service']);
    if (proc.status === 0) {
      mode = 'ap';
      enabled = true;

      let data = null;
      try {
        data = fs.readFileSync('/etc/hostapd/hostapd.conf', 'utf8');
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      if (data) {
        for (const line of data.split('\n')) {
          if (line.startsWith('#')) {
            continue;
          }

          const [key, value] = line.split('=', 2);
          switch (key) {
            case 'ssid':
              options.ssid = value;
              break;
            case 'wpa':
              switch (value) {
                case '0':
                  mgmt = 'none';
                  break;
                case '1':
                  mgmt = 'psk';
                  break;
                case '2':
                  mgmt = 'psk2';
                  break;
              }
              break;
            case 'wpa_passphrase':
              options.key = value;
              break;
            case 'wpa_pairwise':
              if (value.indexOf('TKIP') >= 0) {
                cipher += '+tkip';
              }
              if (value.indexOf('CCMP') >= 0) {
                cipher += '+ccmp';
              }
              break;
          }
        }
      }
    } else {
      mode = 'sta';
      const startProc = child_process.spawnSync('wpa_cli', ['-i', dev_name, 'status'], {
        encoding: 'utf8',
      });

      if (proc.status !== 0) {
        return { enabled, mode, options };
      }

      for (const line of startProc.stdout.split('\n')) {
        const [key, value] = line.split('=', 2);
        switch (key) {
          case 'wpa_state':
            enabled = line.split('=')[1] === 'COMPLETED';
            break;
          case 'ssid':
            options.ssid = line.substring(5);
            break;
          case 'key_mgmt':
            switch (value) {
              case 'WPA2-PSK':
                mgmt = 'psk2';
                break;
              default:
                mgmt = value.toLowerCase();
                break;
            }
            break;
          case 'pairwise_cipher':
            if (value.indexOf('TKIP') >= 0) {
              cipher += '+tkip';
            }
            if (value.indexOf('CCMP') >= 0) {
              cipher += '+ccmp';
            }
            break;
        }
      }

      const listProc = child_process.spawnSync('wpa_cli', ['-i', dev_name, 'list_networks'], {
        encoding: 'utf8',
      });
      if (proc.status !== 0) {
        return { enabled, mode, options };
      }

      options.networks = [];
      for (const line of listProc.stdout.trim().split('\n')) {
        if (line.startsWith('network')) {
          continue;
        }

        const ssid = line.split('\t')[1];
        if (ssid) {
          (<string[]>options.networks).push(ssid);
        }
      }
    }

    if (mgmt) {
      options.encryption = mgmt;

      if (mgmt !== 'none' && cipher) {
        options.encryption += cipher;
      }
    }

    return { enabled, mode, options };
  }



  /**
   * Set the wireless mode and options.
   *
   * @param {boolean} enabled - whether or not wireless is enabled
   * @param {string} mode - ap, sta, ...
   * @param {Object?} options - options specific to wireless mode
   * @returns {boolean} Boolean indicating success.
   */
  setWirelessMode(enabled: string, mode = 'ap', options: Record<string, unknown> = {}): boolean {
    console.log("in setWirelessMode. enabled, mode, options: ", enabled, mode, options);
    const valid = ['ap', 'sta'];
    if (enabled && !valid.includes(mode)) {
      return false;
    }

    const regex = ipRegex({ exact: true });
    if (options.ipaddr && !regex.test(<string>options.ipaddr)) {
      return false;
    }

    let dev_name = 'wlan0'; 
    var wifi_dev_name_check_output = child_process.spawnSync("ifconfig", ["|","grep","'mlan0:'"], { shell: true, encoding: 'utf8' });
    if(wifi_dev_name_check_output.stdout.indexOf('mlan0:') != -1){
      dev_name = 'mlan0';
    }

    
    // First, remove existing networks
    const listProc = child_process.spawnSync('wpa_cli', ['-i', dev_name, 'list_networks'], {
      encoding: 'utf8',
    });
    if (listProc.status === 0) {
      const networks = listProc.stdout
        .split('\n')
        .filter((l) => !l.startsWith('network'))
        .map((l) => l.split(' ')[0])
        .reverse();

      for (const id of networks) {
        const removeNetworkProc = child_process.spawnSync('wpa_cli', [
          '-i',
          dev_name,
          'remove_network',
          id,
        ]);
        if (removeNetworkProc.status !== 0) {
          console.log('Failed to remove network with id:', id);
        }
      }
    }

    // Then, stop hostapd. It will either need to be off or reconfigured, so
    // this is valid in both modes.
    const stopProc = child_process.spawnSync('sudo', ['systemctl', 'stop', 'hostapd.service']);
    if (stopProc.status !== 0) {
      return false;
    }

    if (!enabled) {
      const disableProc = child_process.spawnSync('sudo', [
        'systemctl',
        'disable',
        'hostapd.service',
      ]);
      return disableProc.status === 0;
    }

    // Make sure Wi-Fi isn't blocked by rfkill
    child_process.spawnSync('sudo', ['rfkill', 'unblock', 'wifi']);

    // Now, set the IP address back to a sane state
    const configProc = child_process.spawnSync('sudo', ['ifconfig', dev_name, '0.0.0.0']);
    if (configProc.status !== 0) {
      return false;
    }

    if (mode === 'sta') {
      const addProc = child_process.spawnSync('wpa_cli', ['-i', dev_name, 'add_network'], {
        encoding: 'utf8',
      });
      if (addProc.status !== 0) {
        return false;
      }

      const id = addProc.stdout.trim();

      options.ssid = (<string>options.ssid).replace('"', '\\"');
      let setProc = child_process.spawnSync(
        'wpa_cli',
        // the ssid argument MUST be quoted
        ['-i', dev_name, 'set_network', id, 'ssid', `"${options.ssid}"`]
      );
      if (setProc.status !== 0) {
        return false;
      }

      if (options.key) {
        options.key = (<string>options.key).replace('"', '\\"');
        setProc = child_process.spawnSync(
          'wpa_cli',
          // the psk argument MUST be quoted
          ['-i', dev_name, 'set_network', id, 'psk', `"${options.key}"`]
        );
      } else {
        setProc = child_process.spawnSync('wpa_cli', [
          '-i',
          dev_name,
          'set_network',
          id,
          'key_mgmt',
          'NONE',
        ]);
      }

      if (setProc.status !== 0) {
        return false;
      }

      const enableProc = child_process.spawnSync('wpa_cli', ['-i', dev_name, 'enable_network', id]);
      if (enableProc.status !== 0) {
        return false;
      }

      const saveProc = child_process.spawnSync('wpa_cli', ['-i', dev_name, 'save_config']);
      if (saveProc.status !== 0) {
        return false;
      }

      const disableProc = child_process.spawnSync('sudo', [
        'systemctl',
        'disable',
        'hostapd.service',
      ]);
      if (disableProc.status !== 0) {
        return false;
      }
    } else {
      let config = `interface=${dev_name}\n`;
      config += 'driver=nl80211\n';
      config += 'hw_mode=g\n';
      config += 'channel=6\n';
      config += `ssid=${options.ssid}\n`;

      if (options.key) {
        config += 'wpa=2\n';
        config += `wpa_passphrase=${options.key}\n`;
        config += 'wpa_pairwise=CCMP\n';
      }

      fs.writeFileSync('/tmp/hostapd.conf', config);

      const mvProc = child_process.spawnSync('sudo', [
        'mv',
        '/tmp/hostapd.conf',
        '/etc/hostapd/hostapd.conf',
      ]);

      if (mvProc.status !== 0) {
        return false;
      }

      const startProc = child_process.spawnSync('sudo', ['systemctl', 'start', 'hostapd.service']);
      if (startProc.status !== 0) {
        return false;
      }

      const enableProc = child_process.spawnSync('sudo', [
        'systemctl',
        'enable',
        'hostapd.service',
      ]);
      if (enableProc.status !== 0) {
        return false;
      }
    }

    if (options.ipaddr) {
      const configProc = child_process.spawnSync('sudo', [
        'ifconfig',
        dev_name,
        <string>options.ipaddr,
      ]);
      if (configProc.status !== 0) {
        return false;
      }

      if (mode === 'ap') {
        // set up a default route when running in AP mode. ignore errors here and
        // just try to move on.
        child_process.spawnSync('sudo', [
          'ip',
          'route',
          'add',
          'default',
          'via',
          <string>options.ipaddr,
          'dev',
          dev_name,
        ]);
      }
    }

    return true;
  }

  

  /**
   * Get SSH server status.
   *
   * @returns {boolean} Boolean indicating whether or not SSH is enabled.
   */
  getSshServerStatus(): boolean {

    if (fs.existsSync('/boot/firmware/candle_ssh.txt')) {
      return true
    }
    else{
      
      const proc = child_process.spawnSync('raspi-config', ['nonint', 'get_ssh'], {
        encoding: 'utf8',
      });
  
      if (proc.status !== 0) {
        return false;
      }
  
      return proc.stdout.trim() === '0';
    }
  }

/**
   * Set SSH server status.
   *
   * @param {boolean} enabled - Whether or not to enable the SSH server
   * @returns {boolean} Boolean indicating success of the command.
   */
  setSshServerStatus(enabled: boolean): boolean {
    const arg = enabled ? '0' : '1';
    const proc = child_process.spawnSync('sudo', ['raspi-config', 'nonint', 'do_ssh', arg]);
    return proc.status === 0;
  }

  /**
   * Get mDNS server status.
   *
   * @returns {boolean} Boolean indicating whether or not mDNS is enabled.
   */
  getMdnsServerStatus(): boolean {
    const proc = child_process.spawnSync('systemctl', ['is-active', 'avahi-daemon.service']);
    return proc.status === 0;
  }

  /**
   * Set mDNS server status.
   *
   * @param {boolean} enabled - Whether or not to enable the mDNS server
   * @returns {boolean} Boolean indicating success of the command.
   */
  setMdnsServerStatus(enabled: boolean): boolean {
    let proc = child_process.spawnSync('sudo', [
      'systemctl',
      enabled ? 'start' : 'stop',
      'avahi-daemon.service',
    ]);
    if (proc.status !== 0) {
      return false;
    }

    proc = child_process.spawnSync('sudo', [
      'systemctl',
      enabled ? 'enable' : 'disable',
      'avahi-daemon.service',
    ]);
    return proc.status === 0;
  }

  /**
   * Get the system's hostname.
   *
   * @returns {string} The hostname.
   */
  getHostname(): string {
    return fs.readFileSync('/home/pi/.webthings/etc/hostname', 'utf8').trim();
  }

  /**
   * Set the system's hostname.
   *
   * @param {string} hostname - The hostname to set
   * @returns {boolean} Boolean indicating success of the command.
   */
  setHostname(hostname: string): boolean {
    hostname = hostname.toLowerCase();
    const re = new RegExp(/^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/);
    const valid = re.test(hostname) && hostname.length <= 63;
    if (!valid) {
      return false;
    }

    // Read in the current hostname
    let original = fs.readFileSync('/home/pi/.webthings/etc/hostname', 'utf8');
    if (original) {
      original = original.trim();
    }

    // switched from sed to tee to avoid hostname file being deleted during the process.
    let proc = child_process.spawnSync('echo', [hostname,'|','sudo','tee','/home/pi/.webthings/etc/hostname'],{shell: true});
   
    if (proc.status !== 0) {
      return false;
    }

    let proc2 = child_process.spawnSync('echo', [hostname,'|','sudo','tee','/boot/firmware/hostname.txt'],{shell: true});

    proc = child_process.spawnSync('sudo', ['hostname', hostname]);
    if (proc.status !== 0) {
      // Set the original hostname back
      //child_process.spawnSync('sudo', ['sed', '-i', '-e', `s/^.*$/${original}/`, '/etc/hostname']);
      child_process.spawnSync('echo', [original,'|','sudo','tee','/home/pi/.webthings/etc/hostname'],{shell: true});
      child_process.spawnSync('echo', [original,'|','sudo','tee','/boot/firmware/hostname.txt'],{shell: true});
      child_process.spawnSync('nmcli', ['general','hostname',hostname],{shell: true});
        
      return false;
    }

    proc = child_process.spawnSync('sudo', ['systemctl', 'restart', 'avahi-daemon.service']);
    if (proc.status !== 0) {
      // Set the original hostname back
      //child_process.spawnSync('sudo', ['sed', '-i', '-e', `s/^.*$/${original}/`, '/etc/hostname']);
      child_process.spawnSync('echo', [original,'|','sudo','tee','/home/pi/.webthings/etc/hostname'],{shell: true});
      child_process.spawnSync('echo', [original,'|','sudo','tee','/boot/firmware/hostname.txt'],{shell: true});
      child_process.spawnSync('sudo', ['hostname', original]);
      child_process.spawnSync('nmcli', ['general','hostname',original],{shell: true});

      return false;
    }

    proc = child_process.spawnSync('sudo', [
      'sed',
      '-i',
      '-E',
      '-e',
      //`s/(127\\.0\\.1\\.1[ \\t]+)${original}/\\1${hostname}/g`,
      's/127\\.0\\.1\\.1[ \\t]+.*/127\\.0\\.1\\.1 \\t' + hostname + '/g',
      '/home/pi/.webthings/etc/hosts',
    ]);
    return proc.status === 0;
  }

  /**
   * Restart the gateway process.
   *
   * @returns {boolean} Boolean indicating success of the command.
   */
  restartGateway(): boolean {
    const proc = child_process.spawnSync('sudo', [
      'systemctl',
      'restart',
      'webthings-gateway.service',
    ]);

    // This will probably not fire, but just in case.
    return proc.status === 0;
  }

  /**
   * Restart the system.
   *
   * @returns {boolean} Boolean indicating success of the command.
   */
  restartSystem(): boolean {
    const proc = child_process.spawnSync('sudo', ['reboot']);

    // This will probably not fire, but just in case.
    return proc.status === 0;
  }

  /**
   * Get the MAC address of a network device.
   *
   * @param {string} device - The network device, e.g. wlan0
   * @returns {string|null} MAC address, or null on error
   */
  getMacAddress(device: string): string | null {
    const addrFile = `/sys/class/net/${device}/address`;
    if (!fs.existsSync(addrFile)) {
      return null;
    }

    return fs.readFileSync(addrFile, 'utf8').trim();
  }

  
  
  /**
   * Scan for visible wireless networks.
   *
   * @returns {Object[]} List of networks as objects:
   *                     [
   *                       {
   *                         ssid: '...',
   *                         quality: <number>,
   *                         encryption: true|false,
   *                       },
   *                       ...
   *                     ]
   */
  scanWirelessNetworks(): WirelessNetwork[] {
    const status = this.getWirelessMode();

    const proc = child_process.spawnSync('sudo', ['iwlist', 'scanning'], { encoding: 'utf8' });

    if (proc.status !== 0) {
      return [];
    }

    const lines = proc.stdout
      .split('\n')
      .filter((l) => l.startsWith(' '))
      .map((l) => l.trim());

    // Add an empty line so we don't miss the last cell.
    lines.push('');

    const cells = new Map();
    let cell: Record<string, unknown> = {};

    for (const line of lines) {
      // New cell, start over
      if (line.startsWith('Cell ') || line.length === 0) {
        if (
          cell.hasOwnProperty('ssid') &&
          cell.hasOwnProperty('quality') &&
          cell.hasOwnProperty('encryption') &&
          (<string>cell.ssid).length > 0
        ) {
          if (
            status.mode === 'sta' &&
            status.options.networks &&
            (<string[]>status.options.networks).includes(<string>cell.ssid)
          ) {
            cell.configured = true;
            cell.connected = status.enabled;
          } else {
            cell.configured = false;
            cell.connected = false;
          }

          // If there are two networks with the same SSID, but one is encrypted
          // and the other is not, we need to keep both.
          const key = `${cell.ssid}-${cell.encryption}`;
          if (cells.has(key)) {
            const stored = cells.get(key);
            stored.quality = Math.max(stored.quality, <number>cell.quality);
          } else {
            cells.set(key, cell);
          }
        }

        cell = {};
      }

      if (line.startsWith('ESSID:')) {
        cell.ssid = line.substring(7, line.length - 1);
      }

      if (line.startsWith('Quality=')) {
        cell.quality = parseInt(line.split(' ')[0].split('=')[1].split('/')[0]);
      }

      if (line.startsWith('Encryption key:')) {
        cell.encryption = line.split(':')[1] === 'on';
      }
    }

    return Array.from(cells.values()).sort((a, b) => b.quality - a.quality);
  }







  /**
   * Get the current addresses for Wi-Fi and LAN.
   *
   * @returns {Object} Address object:
   *                   {
   *                     lan: '...',
   *                     wlan: {
   *                       ip: '...',
   *                       ssid: '...',
   *                     }
   *                   }
   */
  getNetworkAddresses(): NetworkAddresses {
    let result = {
      lan: '',
      wlan: {
        ip: '',
        ssid: '',
      },
    };

    
    const interfaces = os.networkInterfaces(); // This doesn't seem to work anymore on later node versions.
    console.log("linux-raspian: getNetworkAddresses: interfaces: ", interfaces);

    let dev_name = 'wlan0'; 
    var wifi_dev_name_check_output = child_process.spawnSync("ifconfig", ["|","grep","'mlan0:'"], { shell: true, encoding: 'utf8' });
    if(wifi_dev_name_check_output.stdout.indexOf('mlan0:') != -1){
      dev_name = 'mlan0';
    }

    
    /*
    if (interfaces.eth0) {
      for (const addr of interfaces.eth0) {
        if (!addr.internal && addr.family === 'IPv4') {
          result.lan = addr.address;
          break;
        }
      }
    }
    */

    // get eth0 ip address via the command line instead
    // ip addr show eth0 | grep "inet\b" | awk '{print $2}' | cut -d/ -f1
    var proc = child_process.spawnSync("ip", ["addr", "show","eth0","|","grep","'inet '","|","awk","'{print $2}'","|","cut","-d/","-f1"], { shell: true, encoding: 'utf8' });

    if (proc.status === 0) {
      console.log("eth0 ip?:", proc.stdout);
      if(typeof proc.stdout == 'string' && proc.stdout.indexOf('.') != -1){
        let lan_ip = proc.stdout.split('\n')[0];
        if(!lan_ip.startsWith('127.')){
          result.lan = lan_ip;
        }
      }
    }

    
   
    /*
    if (interfaces.wlan0) {
      for (const addr of interfaces.wlan0) {
        if (!addr.internal && addr.family === 'IPv4') {
          result.wlan.ip = addr.address;
          break;
        }
      }
    }
    */

    /*
    const status = this.getWirelessMode();
    if (status.enabled && status.options) {
      result.wlan.ssid = <string>status.options.ssid;
    }
    */

    proc = child_process.spawnSync("iwgetid", ["-r"], { encoding: 'utf8' });
    if (proc.status === 0) {
      console.log("wlan ssid?:", proc.stdout);
      if(typeof proc.stdout == 'string'){
        let wlan_ssid = proc.stdout.split('\n')[0];
        if(wlan_ssid.length > 5){
          
          let proc2 = child_process.spawnSync("ip", ["addr", "show",dev_name,"|","grep","'inet\b'","|","awk","'{print $2}'","|","cut","-d/","-f1"], { shell: true, encoding: 'utf8' });
          if (proc2.status === 0) {
            console.log("wlan ip?:", proc2.stdout);
            if(typeof proc2.stdout == 'string' && proc2.stdout.indexOf('.') != -1){
              let wlan_ip = proc2.stdout.split('\n')[0];
              if(!wlan_ip.startsWith('127.') && wlan_ip != '192.168.2.1'){
                result.wlan.ip = wlan_ip;
                result.wlan.ssid = wlan_ssid;
              }
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Determine whether or not the gateway can auto-update itself.
   *
   * @returns {Object} {available: <bool>, enabled: <bool>}
   */
  getSelfUpdateStatus(): SelfUpdateStatus {
    /*
    const timer = 'webthings-gateway.check-for-update.timer';
    const timerExists = fs.existsSync(`/etc/systemd/system/${timer}`);
    const proc = child_process.spawnSync('systemctl', ['is-active', timer]);

    return {
      available: timerExists,
      enabled: proc.status === 0,
    };
    */
    return {
      available: true,
      enabled: true,
    };
  }

  /**
   * Enable/disable auto-updates.
   *
   * @param {boolean} enabled - Whether or not to enable auto-updates.
   * @returns {boolean} Boolean indicating success of the command.
   */
  setSelfUpdateStatus(enabled: boolean): boolean {
    /*
    const timer = 'webthings-gateway.check-for-update.timer';

    let proc = child_process.spawnSync('sudo', ['systemctl', enabled ? 'start' : 'stop', timer]);
    if (proc.status !== 0) {
      return false;
    }

    proc = child_process.spawnSync('sudo', ['systemctl', enabled ? 'enable' : 'disable', timer]);
    return proc.status === 0;
    */
    return true
  }

  /**
   * Get a list of all valid timezones for the system.
   *
   * @returns {string[]} List of timezones.
   */
  getValidTimezones(): string[] {
    const tzdata = '/usr/share/zoneinfo/zone.tab';
    if (!fs.existsSync(tzdata)) {
      return [];
    }

    try {
      const data = fs.readFileSync(tzdata, 'utf8');
      const zones = data
        .split('\n')
        .filter((l) => !l.startsWith('#') && l.length > 0)
        .map((l) => l.split(/\s+/g)[2])
        .sort();

      return zones;
    } catch (e) {
      console.error('Failed to read zone file:', e);
    }

    return [];
  }

  /**
   * Get the current timezone.
   *
   * @returns {string} Name of timezone.
   */
  getTimezone(): string {
    const tzdata = '/etc/timezone';
    if (!fs.existsSync(tzdata)) {
      return '';
    }

    try {
      const data = fs.readFileSync(tzdata, 'utf8');
      return data.trim();
    } catch (e) {
      console.error('Failed to read timezone:', e);
    }

    return '';
  }

  /**
   * Set the current timezone.
   *
   * @param {string} zone - The timezone to set
   * @returns {boolean} Boolean indicating success of the command.
   */
  setTimezone(zone: string): boolean {
    const proc = child_process.spawnSync('sudo', [
      'raspi-config',
      'nonint',
      'do_change_timezone',
      zone,
    ]);
    /*
    const proc = child_process.spawnSync('sudo', [
      'timedatectl',
      'set-timezone',
      zone,
    ]);
    */
    return proc.status === 0;
  }

  /**
   * Get a list of all valid wi-fi countries for the system.
   *
   * @returns {string[]} List of countries.
   */
  getValidWirelessCountries(): string[] {
    const fname = '/usr/share/zoneinfo/iso3166.tab';
    if (!fs.existsSync(fname)) {
      return [];
    }

    try {
      const data = fs.readFileSync(fname, 'utf8');
      const zones = data
        .split('\n')
        .filter((l) => !l.startsWith('#') && l.length > 0)
        .map((l) => l.split('\t')[1])
        .sort();

      return zones;
    } catch (e) {
      console.error('Failed to read zone file:', e);
    }

    return [];
  }

  /**
   * Get the wi-fi country code.
   *
   * @returns {string} Country.
   */
  getWirelessCountry(): string {
    //const proc = child_process.spawnSync('raspi-config', ['nonint', 'get_wifi_country'], {
    //  encoding: 'utf8',
    //});

    // iw reg get | grep 'country' | awk '{print $2}' | head -1
    const proc = child_process.spawnSync('iw', ['reg', 'get', '|', 'grep', '"country"', '|', 'awk', '"{print $2}"', '|', 'head', '-1'], {
      encoding: 'utf8',
    });
    
    if (proc.status !== 0) {
      return '';
    }

    const code = proc.stdout.trim().replace(':','');

    if (code == '00' || code == '99'){
      return '';
    }
    
    const fname = '/usr/share/zoneinfo/iso3166.tab';
    if (!fs.existsSync(fname)) {
      return '';
    }

    let countries;
    try {
      const data = fs.readFileSync(fname, 'utf8');
      countries = data
        .split('\n')
        .filter((l) => !l.startsWith('#') && l.length > 0)
        .map((l) => l.split('\t'));
    } catch (e) {
      console.error('Failed to read country file:', e);
      return '';
    }

    const data = countries.find((c) => c[0] === code);
    if (!data) {
      return '';
    }

    return data[1];
  }

  /**
   * Set the wi-fi country code.
   *
   * @param {string} country - The country to set
   * @returns {boolean} Boolean indicating success of the command.
   */
  setWirelessCountry(country: string): boolean {
    const fname = '/usr/share/zoneinfo/iso3166.tab';
    if (!fs.existsSync(fname)) {
      return false;
    }

    let countries;
    try {
      const data = fs.readFileSync(fname, 'utf8');
      countries = data
        .split('\n')
        .filter((l) => !l.startsWith('#') && l.length > 0)
        .map((l) => l.split('\t'));
    } catch (e) {
      console.error('Failed to read country file:', e);
      return false;
    }

    const data = countries.find((c) => c[1] === country);
    if (!data) {
      return false;
    }

    /*
    const proc = child_process.spawnSync('sudo', [
      'raspi-config',
      'nonint',
      'do_wifi_country',
      data[0],
    ]);
    */
    const proc = child_process.spawnSync('sudo', [
      'iw',
      'reg',
      'set',
      data[0],
    ]);
    return proc.status === 0;
  }

  /**
   * Get the NTP synchronization status.
   *
   * @returns {boolean} Boolean indicating whether or not the time has been
   *                    synchronized.
   */
  getNtpStatus(): boolean {
    const proc = child_process.spawnSync('timedatectl', ['status'], { encoding: 'utf8' });

    if (proc.status !== 0) {
      return false;
    }

    const lines = proc.stdout.split('\n').map((l) => l.trim());
    const status = lines.find((l) => l.indexOf('synchronized:') >= 0);

    if (!status) {
      return false;
    }

    return status.split(':')[1].trim() === 'yes';
  }

  /**
   * Restart the NTP sync service.
   *
   * @returns {boolean} Boolean indicating success of the command.
   */
  restartNtpSync(): boolean {
    const proc = child_process.spawnSync('sudo', [
      'systemctl',
      'restart',
      'systemd-timesyncd.service',
    ]);
    return proc.status === 0;
  }




  



  
  /**
   * Disconnect NetworkManager.
   */
  stop(): void {
    NetworkManager.stop();
  }

  /**
   * Get the current addresses for Wi-Fi and LAN.
   *
   * @returns {Promise<NetworkAddresses>} Promise that resolves with
   *   {
   *     lan: '...',
   *     wlan: {
   *      ip: '...',
   *      ssid: '...',
   *    }
   *  }
   */
  async getNetworkAddressesAsync(): Promise<NetworkAddresses> {
    const result: NetworkAddresses = {
      lan: '',
      wlan: {
        ip: '',
        ssid: '',
      },
    };
    try {
      const ethernetDevices = await NetworkManager.getEthernetDevices();
      const ethernetIp4Config = await NetworkManager.getDeviceIp4Config(ethernetDevices[0]);
      result.lan = ethernetIp4Config[0].address;
    } catch (error) {
      console.log('Unable to detect an Ethernet IP address');
    }
    try {
      const wifiDevices = await NetworkManager.getWifiDevices();
      for (let wd = 0; wd < wifiDevices.length; wd++) {
        const wifiIp4Config = await NetworkManager.getDeviceIp4Config(wifiDevices[wd]);
        if(wifiIp4Config[0].address == '192.168.12.1'){
          // Skip the hotspot on the uap0 interface
          continue
        }
        const accessPoint = await NetworkManager.getActiveAccessPoint(wifiDevices[wd]);
        const ssid = await NetworkManager.getAccessPointSsid(accessPoint);
        result.wlan.ip = wifiIp4Config[0].address;
        result.wlan.ssid = ssid;
        break
      }
    } catch (error) {
      console.log('Unable to detect a Wi-Fi IP address and active SSID');
    }
    return result;
  }

  /**
   * Get LAN network settings.
   *
   * @returns {Promise<LanMode>} Promise that resolves with
   *   {mode: 'static|dhcp|...', options: {...}}
   */
  async getLanModeAsync(): Promise<LanMode> {
    const result: LanMode = {
      mode: '',
      options: {},
    };
    return NetworkManager.getEthernetDevices()
      .then((devices) => {
        return NetworkManager.getDeviceConnection(devices[0]);
      })
      .then((connection) => {
        return NetworkManager.getConnectionSettings(connection);
      })
      .then((settings: ConnectionSettings) => {
        if (settings && settings.ipv4 && settings.ipv4.method == 'auto') {
          result.mode = 'dhcp';
        } else if (settings && settings.ipv4 && settings.ipv4.method == 'manual') {
          result.mode = 'static';
        }
        if (settings.ipv4 && settings.ipv4['address-data'] && settings.ipv4['address-data'][0]) {
          if (settings.ipv4['address-data'][0].hasOwnProperty('address')) {
            result.options.ipaddr = settings.ipv4['address-data'][0].address;
          }
          if (result.options.ipaddr && settings.ipv4['address-data'][0].hasOwnProperty('prefix')) {
            // Convert cidr style prefix to dot-decimal netmask
            const ip = result.options.ipaddr;
            const cidr = settings.ipv4['address-data'][0].prefix;
            const block = new Netmask(`${ip}/${cidr}`);
            result.options.netmask = block.mask;
          }
        }
        if (settings.ipv4 && settings.ipv4.hasOwnProperty('gateway')) {
          result.options.gateway = settings.ipv4.gateway;
        }
        return result;
      })
      .catch((error) => {
        console.error(`Error getting LAN mode from Network Manager: ${error}`);
        return result;
      });
  }

  /**
   * Set LAN network settings.
   *
   * @param {string} mode static|dhcp|....
   * @param {Record<string, unknown>} options Mode-specific options.
   * @returns {Promise<boolean>} Promise that resolves true if successful and false if not.
   */
  async setLanModeAsync(mode: string, options: Record<string, unknown>): Promise<boolean> {
    let lanDevice: string;
    let lanConnection: string;
    return NetworkManager.getEthernetDevices()
      .then((devices) => {
        lanDevice = devices[0];
        return NetworkManager.getDeviceConnection(lanDevice);
      })
      .then((connection) => {
        lanConnection = connection;
        // First get current settings to carry over some values
        return NetworkManager.getConnectionSettings(lanConnection);
      })
      .then((oldSettings) => {
        // Carry over some values from the old settings
        const settings: ConnectionSettings = {
          connection: {
            id: oldSettings.connection.id,
            uuid: oldSettings.connection.uuid,
            type: oldSettings.connection.type,
          },
        };

        if (mode == 'dhcp') {
          // Set dynamic IP
          settings.ipv4 = {
            method: 'auto',
          };
        } else if (mode == 'static') {
          if (
            !(
              options.hasOwnProperty('ipaddr') &&
              ip.isV4Format(<string>options.ipaddr) &&
              options.hasOwnProperty('gateway') &&
              ip.isV4Format(<string>options.gateway) &&
              options.hasOwnProperty('netmask') &&
              ip.isV4Format(<string>options.netmask)
            )
          ) {
            console.log(
              'Setting a static IP address requires a valid IP address, gateway and netmask'
            );
            return false;
          }
          // Set static IP address
          // Convert dot-decimal netmask to cidr style prefix for storage
          const netmask = new Netmask(options.ipaddr as string, options.netmask as string);
          const prefix = netmask.bitmask;
          // Convert dot-decimal IP and gateway to little endian integers for storage
          const ipaddrReversed = (options.ipaddr as string).split('.').reverse().join('.');
          const ipaddrInt = ip.toLong(ipaddrReversed);
          const gatewayReversed = (options.gateway as string).split('.').reverse().join('.');
          const gatewayInt = ip.toLong(gatewayReversed);
          settings.ipv4 = {
            method: 'manual',
            addresses: [[ipaddrInt, prefix, gatewayInt]],
            // The NetworkManager docs say that the addresses property is deprecated,
            // but using address-data and gateway doesn't seem to work on Ubuntu yet.
            /*
            'address-data': [{
              'address': options.ipaddr,
              'prefix': prefix
            }],
            'gateway': options.gateway
            */
          };
        } else {
          console.error('LAN mode not recognised');
          return false;
        }
        return NetworkManager.setConnectionSettings(lanConnection, settings);
      })
      .then(() => {
        return NetworkManager.activateConnection(lanConnection, lanDevice);
      })
      .catch((error) => {
        console.error(`Error setting LAN settings: ${error}`);
        return false;
      });
  }

  /**
   * Scan for visible wireless networks on the first wireless device.
   *
   * @returns {Promise<WirelessNetwork[]>} Promise which resolves with an array
   *   of networks as objects:
   *  [
   *    {
   *      ssid: '...',
   *      quality: <number>,
   *      encryption: true|false,
   *      configured: true|false,
   *      connected: true|false
   *    },
   *    ...
   *  ]
   */
  async scanWirelessNetworksAsync(): Promise<WirelessNetwork[]> {
    const wifiDevices = await NetworkManager.getWifiDevices();
    let wifiDevice = null;
    for (let wd = 0; wd < wifiDevices.length; wd++) {
      const wifiIp4Config = await NetworkManager.getDeviceIp4Config(wifiDevices[wd]);
      if(wifiIp4Config[0].address == '192.168.12.1'){
        // Skip the hotspot on the uap0 interface
        continue
      }
      wifiDevice = wifiDevices[wd];
      break
    }
    if (wifiDevice == null) {
      // Return empty response if no wifi device found
      return [];
    }
    const wifiAccessPoints = await NetworkManager.getWifiAccessPoints(wifiDevice);
    let activeAccessPoint: string | null;
    try {
      activeAccessPoint = await NetworkManager.getActiveAccessPoint(wifiDevice);
    } catch (error) {
      activeAccessPoint = null;
    }
    const apRequests: Array<Promise<WirelessNetwork>> = [];
    wifiAccessPoints.forEach((ap) => {
      apRequests.push(NetworkManager.getAccessPointDetails(ap, activeAccessPoint));
    });
    const responses = await Promise.all(apRequests);
    return responses;
  }

  /**
   * Set the wireless mode and options.
   *
   * @param {boolean} enabled - whether or not wireless is enabled
   * @param {string} mode - ap, sta, ...
   * @param {Record<string, unknown>} options - options specific to wireless mode
   * @returns {Promise<boolean>} Boolean indicating success.
   */
  async setWirelessModeAsync(
    enabled: boolean,
    mode = 'ap',
    options: Record<string, unknown> = {}
  ): Promise<boolean> {
    const valid = [
      // 'ap', //TODO: Implement ap mode
      'sta',
    ];
    //console.log("in setWirelessModeAsync.  enabled, mode, options: ", enabled, mode, options);
    if (enabled && !valid.includes(mode)) {
      console.error(`Wireless mode ${mode} not supported on this platform`);
      return false;
    }
    const wifiDevices = await NetworkManager.getWifiDevices();
    console.log("setWirelessModeAsync: wifiDevices: ", wifiDevices);
    let wifiDevice = null;
    // Add some predictability to which wireless interface is chosen
    if (wifiDevices.indexOf('wlan0') != -1) {
      wifiDevice = 'wlan0';
    }
    else {
      for (let wd = 0; wd < wifiDevices.length; wd++) {
        if (wifiDevices[wd] != 'uap0') {
          wifiDevice = wifiDevices[wd];
          break;
        }
      }
    }
    if (wifiDevice == null) {
      // Return empty response if no wifi device found
      return false;
    }


    // If `enabled` set to false, disconnect wireless device
    if (enabled === false) {
      try {
        await NetworkManager.disconnectNetworkDevice(wifiDevice);
      } catch (error) {
        console.error(`Error whilst attempting to disconnect wireless device: ${error}`);
        return false;
      }
      return true;
    }

    // Otherwise connect to Wi-Fi access point using provided options
    if (!options.hasOwnProperty('ssid')) {
      console.log('Could not connect to wireless network because no SSID provided');
      return false;
    }
    const accessPoint = await NetworkManager.getAccessPointbySsid(options.ssid as string);
    if (accessPoint == null) {
      console.log('No network with specified SSID found');
      return false;
    }
    let secure = false;
    if (options.key) {
      secure = true;
    }
    try {
      NetworkManager.connectToWifiAccessPoint(
        wifiDevice,
        accessPoint,
        <string>options.ssid,
        secure,
        <string>options.key
      );
    } catch (error) {
      console.error(`Error connecting to Wi-Fi access point: ${error}`);
      return false;
    }
    return true;
  }
}

export default new LinuxRaspbianPlatform();
