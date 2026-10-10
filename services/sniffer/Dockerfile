# A real Chromium that opens a player page, presses play and reports the media request it makes
# (the actual .m3u8/.mpd/.mp4 URL plus the headers a download needs). Used for pages that wrap
# their video in an iframe/script instead of exposing a file.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev \
 && npx playwright-core install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
COPY server.mjs ./
# Unprivileged: the browser runs untrusted pages.
RUN useradd -m sniff && chown -R sniff /app /home/sniff
USER sniff
# The browser was installed for root; make it readable and tell playwright where it lives.
ENV NODE_ENV=production PORT=4000 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
EXPOSE 4000
CMD ["node", "server.mjs"]
