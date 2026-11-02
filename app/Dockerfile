# Build the React app, then run it on a slim Node image. Course videos, slides, lab materials
# and the SQLite database are NOT in the image: docker-compose.yml mounts them from the host.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# runtime needs only sirv; the front-end dependencies are already bundled into dist/
RUN echo '{"private":true,"type":"module"}' > package.json && npm install --no-audit --no-fund sirv@2.0.4
COPY --from=build /app/dist ./dist
COPY server ./server
USER node
EXPOSE 8080
CMD ["node", "--no-warnings", "server/index.js"]
