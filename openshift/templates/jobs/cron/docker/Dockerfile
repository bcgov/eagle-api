FROM registry.access.redhat.com/ubi8/ubi:8.3-227

RUN yum install -y jq && \
    mkdir -p /opt/cron && chgrp -R 0 /opt/cron && \
    chmod -R g=u /opt/cron && \
    yum clean all -y

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY get-token.sh /opt/cron/get-token.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && \
    chmod +x /opt/cron/get-token.sh

WORKDIR /opt/cron

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
