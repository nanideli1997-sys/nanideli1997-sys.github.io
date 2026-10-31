/* Página web pública: catálogo, detalle, pedido y envío por WhatsApp.
   Todo el texto que viene del catálogo se inserta como texto (nunca como HTML). */
(() => {
  "use strict";
  const CART_KEY = "tienda_pedido_v1";
  const MAX_QTY = 10;
  const NEW_DAYS = 15;
  const LABEL = { disponible: "Disponible", pocas: "¡Últimas unidades!", agotado: "Agotado" };

  const $ = (sel, el = document) => el.querySelector(sel);
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : String(kid));
    }
    return el;
  }

  let store = { currency: "S/" }, products = [], bySku = new Map(), cart = [];
  const state = { q: "", cat: "", available: false, sort: "nuevos" };

  const money = c => `${store.currency} ${(c / 100).toFixed(2)}`;
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const minPrice = p => Math.min(...p.variants.map(v => v.price));
  const maxPrice = p => Math.max(...p.variants.map(v => v.price));
  const priceText = p => minPrice(p) === maxPrice(p) ? money(minPrice(p)) : `Desde ${money(minPrice(p))}`;
  const isNew = p => (Date.now() - Date.parse(p.created)) < NEW_DAYS * 864e5;
  function status(p) {
    if (p.variants.every(v => v.stock === "agotado")) return "agotado";
    if (p.variants.filter(v => v.stock !== "agotado").every(v => v.stock === "pocas")) return "pocas";
    return "disponible";
  }
  function colorsOf(p) {
    const seen = new Map();
    p.variants.forEach(v => { if (!seen.has(v.color)) seen.set(v.color, v.hex); });
    return [...seen].map(([name, hex]) => ({ name, hex }));
  }
  function imagesFor(p, color) {
    const own = p.images.filter(i => i.color === color);
    return own.length ? own : p.images;
  }

  function toast(text) {
    const t = $("[data-toast]");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------------------------------------------------------------- catálogo
  function renderCats() {
    const cats = [...new Set(products.map(p => p.category))].sort((a, b) => a.localeCompare(b, "es"));
    const box = $("[data-cats]");
    box.replaceChildren(...["", ...cats].map(c => h("button", {
      class: "chip", type: "button", role: "tab", "aria-selected": String(state.cat === c),
      onclick: () => { state.cat = c; renderCats(); renderGrid(); },
    }, c || "Todo")));
  }

  function card(p) {
    const st = status(p);
    const img = p.images[0];
    let badge = null;
    if (st === "agotado") badge = h("span", { class: "badge agotado" }, "Agotado");
    else if (st === "pocas") badge = h("span", { class: "badge pocas" }, "Últimas unidades");
    else if (isNew(p)) badge = h("span", { class: "badge nuevo" }, "Nuevo");
    return h("article", {
      class: "card" + (st === "agotado" ? " sold" : ""), tabindex: "0", role: "button",
      "aria-label": `${p.name}, ${priceText(p)}`,
      onclick: () => openProduct(p),
      onkeydown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProduct(p); } },
    },
      h("div", { class: "ph" },
        img ? h("img", { src: img.mini, alt: p.name, loading: "lazy" }) : "Sin foto",
        badge),
      h("div", { class: "info" },
        h("h3", {}, p.name),
        p.design ? h("p", { class: "design" }, p.design) : null,
        h("div", { class: "row" },
          h("span", { class: "price" }, priceText(p)),
          h("span", { class: "dots" }, colorsOf(p).slice(0, 6).map(c =>
            h("span", { class: "dot", title: c.name, style: `background:${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#ccc"}` }))))));
  }

  function renderGrid() {
    const q = norm(state.q);
    let list = products.filter(p =>
      (!state.cat || p.category === state.cat) &&
      (!state.available || status(p) !== "agotado") &&
      (!q || norm([p.name, p.design, p.category, p.brand, p.pattern, p.id, ...colorsOf(p).map(c => c.name)].join(" ")).includes(q)));
    const sorters = {
      precio_asc: (a, b) => minPrice(a) - minPrice(b),
      precio_desc: (a, b) => maxPrice(b) - maxPrice(a),
      nombre: (a, b) => a.name.localeCompare(b.name, "es"),
    };
    if (sorters[state.sort]) list = [...list].sort(sorters[state.sort]);
    // Agotados siempre al final
    list = [...list.filter(p => status(p) !== "agotado"), ...list.filter(p => status(p) === "agotado")];
    $("[data-count]").textContent = `${list.length} prenda${list.length === 1 ? "" : "s"}`;
    const grid = $("[data-grid]");
    grid.replaceChildren(...(list.length ? list.map(card)
      : [h("p", { class: "empty" }, products.length ? "No encontramos prendas con esa búsqueda." : "Pronto publicaremos nuestras prendas.")]));
  }

  // ---------------------------------------------------------------- detalle
  const dialog = $("[data-product]");

  function openProduct(p) {
    const colors = colorsOf(p);
    const firstAvailable = p.variants.find(v => v.stock !== "agotado");
    const sel = { color: (firstAvailable || p.variants[0]).color, size: null, qty: 1, img: 0 };

    const main = h("div", { class: "pd-main" });
    const thumbs = h("div", { class: "pd-thumbs" });
    const priceEl = h("div", { class: "pd-price" });
    const colorBox = h("div", { class: "opts" });
    const sizeBox = h("div", { class: "opts" });
    const availEl = h("div", { class: "avail" });
    const qtyEl = h("span", {}, "1");
    const addBtn = h("button", { class: "btn-main", type: "button", onclick: add }, "Agregar al pedido");

    function variant() { return p.variants.find(v => v.color === sel.color && v.size === sel.size); }
    function update() {
      const imgs = imagesFor(p, sel.color);
      sel.img = Math.min(sel.img, Math.max(imgs.length - 1, 0));
      main.replaceChildren(imgs.length ? h("img", { src: imgs[sel.img].src, alt: `${p.name} ${sel.color}` }) : "Sin foto");
      thumbs.replaceChildren(...(imgs.length > 1 ? imgs.map((im, i) => h("button", {
        type: "button", "aria-current": String(i === sel.img), "aria-label": `Foto ${i + 1}`,
        onclick: () => { sel.img = i; update(); },
      }, h("img", { src: im.mini, alt: "" }))) : []));

      colorBox.replaceChildren(...colors.map(c => h("button", {
        class: "opt", type: "button", "aria-pressed": String(c.name === sel.color),
        onclick: () => {
          sel.color = c.name; sel.img = 0;
          const still = variant();
          if (!still || still.stock === "agotado") sel.size = null;
          update();
        },
      }, h("span", { class: "dot", style: `background:${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#ccc"}` }), c.name)));

      const sizes = p.variants.filter(v => v.color === sel.color);
      sizeBox.replaceChildren(...sizes.map(v => h("button", {
        class: "opt", type: "button", "aria-pressed": String(v.size === sel.size), disabled: v.stock === "agotado",
        title: LABEL[v.stock], onclick: () => { sel.size = v.size; update(); },
      }, v.size)));

      const v = variant();
      if (v) {
        priceEl.textContent = money(v.price);
        availEl.className = `avail ${v.stock}`;
        availEl.textContent = LABEL[v.stock];
      } else {
        const prices = sizes.map(s => s.price);
        const lo = Math.min(...prices), hi = Math.max(...prices);
        priceEl.textContent = lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
        const anyAvail = sizes.some(s => s.stock !== "agotado");
        availEl.className = `avail ${anyAvail ? "" : "agotado"}`;
        availEl.textContent = anyAvail ? "Elige tu talla" : "Agotado en este color";
      }
      qtyEl.textContent = sel.qty;
      addBtn.disabled = !!v && v.stock === "agotado";
    }
    function add() {
      const v = variant();
      if (!v) { toast("Elige una talla"); return; }
      addToCart(v.sku, sel.qty);
      toast(`Agregado: ${p.name} (${v.color}, ${v.size})`);
      dialog.close();
    }
    function step(d) { sel.qty = Math.min(MAX_QTY, Math.max(1, sel.qty + d)); update(); }

    const extra = [p.brand && `Marca: ${p.brand}`, p.pattern && `Estampado: ${p.pattern}`, `Código: ${p.id}`].filter(Boolean).join(" · ");
    dialog.replaceChildren(h("div", { class: "pd" },
      h("div", { class: "pd-gallery" }, main, thumbs),
      h("div", { class: "pd-info" },
        h("button", { class: "icon-btn", type: "button", "aria-label": "Cerrar", onclick: () => dialog.close() }, "✕"),
        h("h2", {}, p.name),
        p.design ? h("p", { class: "pd-sub" }, p.design) : null,
        priceEl,
        p.description ? h("p", { class: "pd-desc" }, p.description) : null,
        h("div", {}, h("div", { class: "opt-label" }, "Color"), colorBox),
        h("div", {}, h("div", { class: "opt-label" }, "Talla"), sizeBox),
        availEl,
        h("div", { class: "pd-actions" },
          h("div", { class: "qty" },
            h("button", { type: "button", "aria-label": "Menos", onclick: () => step(-1) }, "−"), qtyEl,
            h("button", { type: "button", "aria-label": "Más", onclick: () => step(1) }, "+")),
          addBtn),
        h("p", { class: "pd-sub", style: "margin:0;font-size:.82rem" }, extra),
        h("button", { class: "btn-link", type: "button", onclick: () => share(p) }, "Compartir esta prenda"))));
    update();
    history.replaceState(null, "", `#p=${encodeURIComponent(p.id)}`);
    if (!dialog.open) dialog.showModal();
  }

  function share(p) {
    const url = location.href.split("#")[0] + `#p=${encodeURIComponent(p.id)}`;
    if (navigator.share) navigator.share({ title: p.name, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Enlace copiado"));
  }

  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));

  // ---------------------------------------------------------------- pedido
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* modo privado */ }
    renderCart();
  }
  function loadCart() {
    try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { cart = []; }
    if (!Array.isArray(cart)) cart = [];
    const before = cart.length;
    cart = cart.filter(i => i && bySku.has(i.sku) && bySku.get(i.sku).v.stock !== "agotado")
               .map(i => ({ sku: i.sku, qty: Math.min(MAX_QTY, Math.max(1, parseInt(i.qty, 10) || 1)) }));
    if (cart.length < before) toast("Algunas prendas de tu pedido ya no están disponibles y se quitaron.");
  }
  function addToCart(sku, qty) {
    const line = cart.find(i => i.sku === sku);
    if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
    else cart.push({ sku, qty });
    saveCart();
    const btn = $("[data-open-cart]");
    btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump");
  }
  const cartTotal = () => cart.reduce((s, i) => s + bySku.get(i.sku).v.price * i.qty, 0);

  function renderCart() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const badge = $("[data-cart-count]");
    badge.hidden = !count;
    badge.textContent = count;
    const box = $("[data-cart-items]");
    if (!cart.length) {
      box.replaceChildren(h("p", { class: "empty" }, "Tu pedido está vacío. Toca una prenda para agregarla."));
    } else {
      box.replaceChildren(...cart.map(item => {
        const { p, v } = bySku.get(item.sku);
        const img = imagesFor(p, v.color)[0];
        const change = d => {
          item.qty += d;
          if (item.qty < 1) cart = cart.filter(i => i !== item);
          item.qty = Math.min(MAX_QTY, item.qty);
          saveCart();
        };
        return h("div", { class: "line" },
          img ? h("img", { src: img.mini, alt: "" }) : h("span", { class: "noimg" }),
          h("div", {},
            h("h4", {}, p.name),
            h("p", {}, `${v.color} · Talla ${v.size}${v.stock === "pocas" ? " · últimas unidades" : ""}`),
            h("div", { class: "qty" },
              h("button", { type: "button", "aria-label": "Menos", onclick: () => change(-1) }, "−"),
              h("span", {}, item.qty),
              h("button", { type: "button", "aria-label": "Más", onclick: () => change(1) }, "+"))),
          h("div", { class: "line-end" }, money(v.price * item.qty),
            h("button", { class: "btn-link", type: "button", onclick: () => { cart = cart.filter(i => i !== item); saveCart(); } }, "Quitar")));
      }));
    }
    $("[data-cart-total]").textContent = money(cartTotal());
    $("[data-order] .btn-wa").disabled = !cart.length;
  }

  function openCart(open) {
    $("[data-cart]").hidden = !open;
    $("[data-overlay]").hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  }

  function orderMessage(form) {
    const lines = cart.map((item, n) => {
      const { p, v } = bySku.get(item.sku);
      return `${n + 1}. ${p.name}${p.design ? " – " + p.design : ""} (${p.id})\n` +
             `   Color: ${v.color} · Talla: ${v.size} · Cant.: ${item.qty} · ${money(v.price * item.qty)}`;
    });
    const f = new FormData(form);
    const extra = [
      `Nombre: ${f.get("nombre").trim()}`,
      `Entrega: ${f.get("entrega")}`,
      f.get("entrega") === "Delivery" && f.get("direccion").trim() ? `Dirección: ${f.get("direccion").trim()}` : null,
      f.get("nota").trim() ? `Comentario: ${f.get("nota").trim()}` : null,
    ].filter(Boolean);
    return `Hola ${store.name}, quiero hacer este pedido:\n\n${lines.join("\n")}\n\n` +
           `*Total: ${money(cartTotal())}*\n\n${extra.join("\n")}\n\n(Pedido enviado desde la página web)`;
  }

  // ---------------------------------------------------------------- inicio
  function bind() {
    $("[data-search]").addEventListener("input", e => { state.q = e.target.value; renderGrid(); });
    $("[data-only-available]").addEventListener("change", e => { state.available = e.target.checked; renderGrid(); });
    $("[data-sort]").addEventListener("change", e => { state.sort = e.target.value; renderGrid(); });
    $("[data-open-cart]").addEventListener("click", () => openCart(true));
    $("[data-close-cart]").addEventListener("click", () => openCart(false));
    $("[data-overlay]").addEventListener("click", () => openCart(false));
    document.addEventListener("keydown", e => { if (e.key === "Escape") openCart(false); });
    $("[data-delivery]").addEventListener("change", e => { $("[data-address]").hidden = e.target.value !== "Delivery"; });
    $("[data-clear-cart]").addEventListener("click", () => { if (cart.length && confirm("¿Vaciar tu pedido?")) { cart = []; saveCart(); } });
    $("[data-order]").addEventListener("submit", e => {
      e.preventDefault();
      if (!cart.length) return;
      const url = `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(orderMessage(e.target))}`;
      window.open(url, "_blank", "noopener");
      toast("Se abrió WhatsApp: envía el mensaje para confirmar tu pedido.");
    });
  }

  function openFromHash() {
    const m = location.hash.match(/^#p=(.+)$/);
    if (!m) return;
    const p = products.find(x => x.id === decodeURIComponent(m[1]));
    if (p) openProduct(p);
  }

  bind();
  fetch(window.TIENDA.catalogo, { cache: "no-cache" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => {
      store = d.store;
      products = d.products || [];
      products.forEach(p => p.variants.forEach(v => bySku.set(v.sku, { p, v })));
      if (d.updated) $("[data-updated]").textContent = `Catálogo actualizado el ${d.updated}`;
      loadCart();
      renderCats();
      renderGrid();
      renderCart();
      openFromHash();
    })
    .catch(() => {
      $("[data-grid]").replaceChildren(h("p", { class: "empty" }, "No se pudo cargar el catálogo. Revisa tu conexión y vuelve a intentar."));
    });
})();
