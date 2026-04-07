# Χρησιμοποιούμε node:20 (Debian-based) αντί για node:20-alpine.
# Ο λόγος: το @xenova/transformers χρησιμοποιεί onnxruntime-node που απαιτεί glibc
# (ld-linux-x86-64.so.2). Το Alpine Linux χρησιμοποιεί musl libc και δεν έχει glibc,
# οπότε το native binary αποτυγχάνει. Το Debian-based image έχει glibc και λειτουργεί.
FROM node:20

WORKDIR /app

# Εγκατάσταση dependencies πρώτα (αξιοποιεί το layer cache του Docker —
# αν δεν αλλάξει το package.json, αυτό το layer δεν ξαναχτίζεται)
COPY package.json package-lock.json ./
RUN npm install

# Αντιγραφή πηγαίου κώδικα
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
