/* Validación de datos externos. No contiene credenciales ni ejecuta contenido del catálogo. */
(() => {
  "use strict";
  const LIMIT = Object.freeze({ products: 500, variants: 240, images: 16, cart: 30, orders: 20, price: 100000000, bytes: 2097152, age: 30 * 864e5 });
  const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  function text(value, max = 160, multiline = false) {
    if (typeof value !== "string") return "";
    const clean = value.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "");
    return Array.from(clean).filter((c) => { const n = c.codePointAt(0); return n < 0xd800 || n > 0xdfff; })
      .slice(0, max).join("").replace(multiline ? /\r\n?/g : /[\r\n\t]/g, multiline ? "\n" : " ").trim();
  }
  const id = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(v) ? v : "";
  const phone = (v) => typeof v === "string" && /^[1-9][0-9]{7,14}$/.test(v) ? v : "";
  const money = (v) => Number.isSafeInteger(v) && v >= 0 && v <= LIMIT.price;
  const hex = (v) => typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : "#cccccc";
  function image(value) {
    if (typeof value !== "string" || value.length > 300) return "";
    return /^img\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:webp|png|jpe?g|avif|gif)(?:\?[A-Za-z0-9_.~%=&+-]*)?$/i.test(value) ? value : "";
  }
  function catalog(data, destination) {
    if (!record(data) || !record(data.store) || !Array.isArray(data.products) || data.products.length > LIMIT.products || !phone(destination)) throw new Error("Invalid catalog");
    const products = [], productIds = new Set(), skus = new Set();
    for (const raw of data.products) {
      if (!record(raw) || !id(raw.id) || productIds.has(raw.id) || !text(raw.name) || !Array.isArray(raw.variants) || raw.variants.length > LIMIT.variants) continue;
      const variants = [], ownSkus = new Set();
      for (const v of raw.variants) {
        if (!record(v) || !id(v.sku) || skus.has(v.sku) || ownSkus.has(v.sku) || !text(v.color, 60) || !text(v.size, 20) || !money(v.price) || !["disponible", "pocas", "agotado"].includes(v.stock)) continue;
        ownSkus.add(v.sku);
        variants.push({ sku: v.sku, color: text(v.color, 60), size: text(v.size, 20), hex: hex(v.hex), price: v.price, stock: v.stock });
      }
      if (!variants.length) continue;
      const images = (Array.isArray(raw.images) ? raw.images.slice(0, LIMIT.images) : []).filter(record).map((im) => ({ src: image(im.src), mini: image(im.mini) || image(im.src), color: im.color === null ? null : text(im.color, 60) })).filter((im) => im.src);
      const availableSizes = [...new Set(variants.map((v) => v.size))];
      const orderedSizes = Array.isArray(raw.sizes) ? raw.sizes.slice(0, 40).map((s) => text(s, 20)).filter((s) => availableSizes.includes(s)) : [];
      products.push({ id: raw.id, name: text(raw.name), category: text(raw.category, 80) || "Prendas", design: text(raw.design), brand: text(raw.brand, 80), pattern: text(raw.pattern, 80), description: text(raw.description, 2000, true), created: typeof raw.created === "string" && raw.created.length <= 40 && Number.isFinite(Date.parse(raw.created)) ? new Date(raw.created).toISOString() : "", images, variants, sizes: [...new Set([...orderedSizes, ...availableSizes])] });
      productIds.add(raw.id); ownSkus.forEach((sku) => skus.add(sku));
    }
    return { store: { name: text(data.store.name, 80) || "Dulce Nani", address: text(data.store.address, 140), whatsapp: destination }, products, updated: text(data.updated, 80) };
  }
  function customer(raw) {
    if (!record(raw)) return null;
    const c = { name: text(raw.name, 80), phone: text(raw.phone, 20), delivery: raw.delivery, payment: raw.payment, address: text(raw.address, 140), district: text(raw.district, 60) };
    if (!c.name || !/^[+0-9\s()-]{7,20}$/.test(c.phone) || c.phone.replace(/\D/g, "").length < 7 || c.phone.replace(/\D/g, "").length > 15 || !["Delivery", "Recojo en tienda"].includes(c.delivery) || !["Yape", "Plin", "Transferencia bancaria", "Efectivo"].includes(c.payment)) return null;
    if (c.delivery === "Delivery" && (!c.address || !c.district)) return null;
    if (c.delivery !== "Delivery") { c.address = ""; c.district = ""; }
    return c;
  }
  function savedCustomer(raw, now = Date.now()) {
    if (!record(raw) || !Number.isFinite(raw.savedAt) || raw.savedAt > now + 864e5 || now - raw.savedAt > LIMIT.age) return {};
    return customer(raw) || {};
  }
  function orders(raw, now = Date.now()) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.slice(0, LIMIT.orders).flatMap((o) => {
      if (!record(o) || !id(o.id) || seen.has(o.id) || !Array.isArray(o.items) || !o.items.length || o.items.length > LIMIT.cart) return [];
      const timestamp = typeof o.date === "string" ? Date.parse(o.date) : NaN, c = customer(o.customer);
      if (!c || !Number.isFinite(timestamp) || timestamp > now + 864e5 || now - timestamp > LIMIT.age) return [];
      const items = [];
      for (const i of o.items) {
        if (!record(i) || !id(i.id) || !id(i.sku) || !text(i.name) || !text(i.size, 20) || !text(i.color, 60) || !money(i.price) || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 10) return [];
        items.push({ id: i.id, sku: i.sku, name: text(i.name), size: text(i.size, 20), color: text(i.color, 60), qty: i.qty, price: i.price });
      }
      seen.add(o.id);
      return [{ id: o.id, date: new Date(timestamp).toISOString(), customer: c, notes: text(o.notes, 300, true), status: "Listo para enviar", items, total: items.reduce((sum, i) => sum + i.price * i.qty, 0) }];
    });
  }
  function cart(raw, skuMap) {
    if (!Array.isArray(raw)) return [];
    const result = new Map();
    for (const item of raw.slice(0, LIMIT.cart * 2)) {
      if (!record(item) || !id(item.sku) || !skuMap.has(item.sku) || skuMap.get(item.sku).v.stock === "agotado" || !Number.isInteger(item.qty) || item.qty < 1) continue;
      if (!result.has(item.sku) && result.size >= LIMIT.cart) continue;
      result.set(item.sku, Math.min(10, (result.get(item.sku) || 0) + Math.min(item.qty, 10)));
    }
    return [...result].map(([sku, qty]) => ({ sku, qty }));
  }
  async function loadCatalog(path) {
    const url = new URL(path, location.href);
    if (url.origin !== location.origin || url.username || url.password || !url.pathname.endsWith("/catalogo.json")) throw new Error("Catalog origin");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url.href, { cache: "no-cache", mode: "same-origin", credentials: "omit", redirect: "error", signal: controller.signal });
      if (!response.ok || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("Catalog response");
      if (Number(response.headers.get("content-length")) > LIMIT.bytes) throw new Error("Catalog size");
      let bytes;
      if (response.body?.getReader) {
        const reader = response.body.getReader(), chunks = []; let size = 0;
        while (true) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength;
          if (size > LIMIT.bytes) { await reader.cancel(); throw new Error("Catalog size"); }
          chunks.push(part.value);
        }
        bytes = new Uint8Array(size); let offset = 0;
        for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
      } else {
        bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > LIMIT.bytes) throw new Error("Catalog size");
      }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } finally { clearTimeout(timer); }
  }
  Object.defineProperty(window, "DulceDatos", { value: Object.freeze({ LIMIT, text, id, phone, hex, image, catalog, customer, savedCustomer, orders, cart, loadCatalog }), writable: false, configurable: false });
})();
