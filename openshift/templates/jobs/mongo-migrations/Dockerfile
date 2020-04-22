# using glibc, oc works but mongo install fails
# using apline with mongo, mongo works but oc won't run... 
FROM frolvlad/alpine-glibc:latest
USER root

RUN apk update

# install curl
RUN apk add --update curl rsync \
    && rm -rf /var/cache/apk/*

# Upgrade curl (wrong version for the OC is installed by default)
RUN apk upgrade

# install OC cli
ENV OPENSHIFT_VERSION v3.11.0
ENV OPENSHIFT_HASH 0cbc58b

RUN apk add --no-cache --virtual .build-deps curl tar \
    && curl --retry 7 -Lso /tmp/client-tools.tar.gz "https://github.com/openshift/origin/releases/download/${OPENSHIFT_VERSION}/openshift-origin-client-tools-${OPENSHIFT_VERSION}-${OPENSHIFT_HASH}-linux-64bit.tar.gz" \
    && tar zxf /tmp/client-tools.tar.gz --strip-components=1 -C /usr/local/bin \
    && rm /tmp/client-tools.tar.gz \
    && apk del .build-deps

RUN apk add --update ca-certificates

# install nodejs, npm
RUN apk add --update npm \
# install git
    && apk add --no-cache bash git openssh

# create a directory to shove the code into
RUN mkdir /eagle-api
# clone branch
RUN git clone -b develop https://github.com/bcgov/eagle-api.git /eagle-api

# start mongodb installs
RUN apk --update add curl libgcc libstdc++

# grab repo list for mongo
# RUN echo 'http://dl-cdn.alpinelinux.org/alpine/v3.8/main' >> /etc/apk/repositories
# RUN echo 'http://dl-cdn.alpinelinux.org/alpine/v3.8/community' >> /etc/apk/repositories
# RUN apk update
# RUN apk add mongodb yaml-cpp=0.6.2-r2
# get mongo up and running
# Install mongodb (alpine v3.8 will install mongo 3.6. For 4 use apline v3.9)
# RUN apk --update add mongodb mongodb-tools
ENV MONGODB_VERSION 3.6.0
RUN apk --update add curl libgcc libstdc++ && \
    cd /tmp && \
    curl -SLo- https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-${MONGODB_VERSION}.tgz | \
    tar xz && \
    mv mongodb-linux-x86_64-${MONGODB_VERSION}/bin/* /usr/bin/ && \
    apk del curl && \
    rm -rf /tmp/* /var/cache/apk/* 
    
RUN mkdir -p /data/db

# expose the port 
EXPOSE 27017
CMD ["mongod"]

# call the entrypoint script
# The bash script will handle running the migrations and clean up
# COPY ./entrypoint.sh /
# ENTRYPOINT ["/entrypoint.sh"]

# change from root (no way to go back from here!)
# USER 1001
# for debugging only, remove this when done!
# this command will let the image run, even when the script it finished
# so you can log into it, check logs, etc. We don't want this behaviour
# outside of local testing
# CMD tail -f /dev/null