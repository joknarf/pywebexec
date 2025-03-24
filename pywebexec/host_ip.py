from socket import gethostname, gethostbyname_ex, gethostbyaddr, inet_aton, inet_ntoa

def resolve_hostname(host):
    """try get fqdn from DNS/hosts"""
    try:
        hostinfo = gethostbyname_ex(host)
        for ip in hostinfo[2]:
            if not ip.startswith('127.') or host in ('localhost', 'localhost.localdomain'):
                return (hostinfo[0].rstrip('.'), ip)
        return (host, host)
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


def get_host_ip(host_or_ip='0.0.0.0'):
    if host_or_ip == '0.0.0.0':
        return resolve(gethostname())
    if host_or_ip in ('localhost', '127.0.0.1'):
        return ('localhost', '127.0.0.1')
    return resolve(host_or_ip)

if __name__ == '__main__':
    print(get_host_ip())
