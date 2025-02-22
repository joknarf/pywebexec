import subprocess
import ipaddress
import platform
import psutil
from socket import gethostname, gethostbyname_ex, gethostbyaddr, inet_aton, inet_ntoa, AF_INET, SOCK_STREAM

def resolve_hostname(host):
    """try get fqdn from DNS/hosts"""
    try:
        hostinfo = gethostbyname_ex(host)
        return (hostinfo[0].rstrip('.'), hostinfo[2][0])
    except OSError:
        return (host, host)


def resolve_ip(ip):
    """try resolve hostname by reverse dns query on ip addr"""
    ip = inet_ntoa(inet_aton(ip))
    try:
        ipinfo = gethostbyaddr(ip)
        return (ipinfo[0].rstrip('.'), ipinfo[2][0])
    except OSError:
        return (ip, ip)


def is_ip(host):
    """determine if host is valid ip"""
    try:
        inet_aton(host)
        return True
    except OSError:
        return False


def resolve(host_or_ip):
    """resolve hostname from ip / hostname"""
    if is_ip(host_or_ip):
        return resolve_ip(host_or_ip)
    return resolve_hostname(host_or_ip)


def get_default_gateway():
    system = platform.system()
    try:
        if system == "Linux":
            result = subprocess.run(['ip', 'route', 'show', 'default'], capture_output=True, text=True)
            lines = result.stdout.splitlines()
            for line in lines:
                parts = line.split()
                if 'via' in parts:
                    return parts[2]
        elif system == "Darwin":
            result = subprocess.run(['netstat', '-nr', '-f', 'inet'], capture_output=True, text=True)
            lines = result.stdout.splitlines()
            for line in lines:
                if 'default' in line and 'UTS' not in line:
                    parts = line.split()
                    if is_ip(parts[1]):
                        return parts[1]
    except Exception as e:
        pass
    return None

def netmask_to_cidr(netmask):
    # Octet mask to CIDR
    octets = netmask.split('.')
    binary_str = ''.join(f'{int(octet):08b}' for octet in octets)
    cidr = binary_str.count('1')
    return cidr

def _netmask_to_cidr(netmask):
    # hex mask to CIDR
    return sum([bin(int(h, 16)).count('1') for h in netmask.split('.')])


def get_local_networks():
    networks = []
    neti_dict = psutil.net_if_addrs()
    for snic_list in neti_dict.values():
        for snic in snic_list:
            if snic.family.name == 'AF_INET':
                prefixlen = netmask_to_cidr(snic.netmask)
                network = ipaddress.IPv4Network(f"{snic.address}/{prefixlen}", strict=False)
                networks.append((snic.address, network))
    return networks


def is_gateway_in_network(gateway_ip, network):
    return ipaddress.IPv4Address(gateway_ip) in network

def get_host_ip_from_gateway():
    gateway = get_default_gateway()
    if gateway:
        local_networks = get_local_networks()
        for ip, network in local_networks:
            if is_gateway_in_network(gateway, network):
                return ip
        else:
            return '127.0.0.1'
    else:
        return '127.0.0.1'

def get_host_ip(host_or_ip='0.0.0.0'):
    if host_or_ip == '0.0.0.0':
        (hostname, ip) = resolve(gethostname())
        if ip == '127.0.0.1':
            (hostname, ip) = resolve(get_host_ip_from_gateway())
    else:
        (hostname, ip) = resolve(host_or_ip)
    return (hostname, ip)

if __name__ == '__main__':
    print(get_host_ip())