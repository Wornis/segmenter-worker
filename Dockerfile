FROM node:12-slim

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install --pure-lockfile --only=production

COPY . ./

ENV NODE_ENV=production

CMD ["yarn", "start" ]
