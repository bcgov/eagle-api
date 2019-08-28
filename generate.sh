PROJECTS=10;
if [ ! -z "${1}" ]; then PROJECTS=$1; fi

node ./seed/generate.ts $PROJECTS;
