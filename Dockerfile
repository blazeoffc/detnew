FROM node:20-alpine AS base
LABEL authors="tapnisu"

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci --only=production

FROM base AS build
COPY package.json package-lock.json /app/
RUN npm ci

COPY . /app
RUN npm run build

FROM base
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules

CMD [ "npm", "start" ]
