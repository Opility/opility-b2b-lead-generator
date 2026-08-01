# Use Apify Node.js official image
FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install npm packages quietly
RUN npm --quiet ci --only=production

# Copy source code
COPY . ./

# Run actor
CMD ["npm", "start"]
