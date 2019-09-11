PROJECTS=10;
if [ ! -z "${1}" ]; then PROJECTS=$1; fi
rm -f ./generate_num.config;
echo "$PROJECTS" > generate_num.config;
node_modules/.bin/jest ./api/test/generate.test.js
