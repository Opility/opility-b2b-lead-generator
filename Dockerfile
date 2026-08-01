# Use Apify Node.js official image
FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install npm packages
RUN npm --quiet install --omit=dev

# Copy source code
COPY . ./

# Run actor
CMD ["npm", "start"]
