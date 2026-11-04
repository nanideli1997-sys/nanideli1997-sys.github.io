/* Página web pública de la tienda (diseño basado en demo_tienda/tienda_web).
   Los productos vienen de catalogo.json, generado por el sistema local al publicar.
   Todo texto del catálogo pasa por esc() antes de insertarse en el HTML. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s = "") => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeHex = (h) => (/^#[0-9a-f]{3,8}$/i.test(h || "") ? h : "#cccccc");
  const ls = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem("tienda_" + k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem("tienda_" + k, JSON.stringify(v)); } catch { /* modo privado */ } }
  };
  const CATALOGO = document.currentScript.dataset.catalogo;
  const MAX_QTY = 10;
  const NEW_DAYS = 15;
  const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
  const fmt = (cents) => money.format((cents || 0) / 100);

  /* ---------- Datos ---------- */
  let STORE = {}, PRODUCTS = [];
  const BY_SKU = new Map();
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const minPrice = (p) => Math.min(...p.variants.map((v) => v.price));
  const maxPrice = (p) => Math.max(...p.variants.map((v) => v.price));
  const isNew = (p) => Date.now() - Date.parse(p.created) < NEW_DAYS * 864e5;
  const status = (p) => {
    const open = p.variants.filter((v) => v.stock !== "agotado");
    if (!open.length) return "agotado";
    return open.every((v) => v.stock === "pocas") ? "pocas" : "disponible";
  };
  const colorsOf = (p) => {
    const seen = new Map();
    p.variants.forEach((v) => { if (!seen.has(v.color)) seen.set(v.color, safeHex(v.hex)); });
    return [...seen].map(([name, hex]) => ({ name, hex }));
  };
  const sizesOf = (p) => p.sizes || [...new Set(p.variants.map((v) => v.size))];
  const variantOf = (p, color, size) => p.variants.find((v) => v.color === color && v.size === size);
  const imagesFor = (p, color) => { const own = p.images.filter((i) => i.color === color); return own.length ? own : p.images; };
  const coverOf = (p) => (p.images[0] ? p.images[0].mini : placeholder(p.name));

  // Imagen de respaldo si no hay foto o una foto no carga
  function placeholder(text = "") {
    const t = esc(text).slice(0, 22);
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe6dc"/><stop offset="1" stop-color="#d9c2ad"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="48%" font-family="Georgia" font-size="64" text-anchor="middle" fill="#8f5536">👕</text><text x="50%" y="58%" font-family="Arial" font-size="30" text-anchor="middle" fill="#6f6a64">${t}</text></svg>`);
  }
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && !img.dataset.fallback) { img.dataset.fallback = "1"; img.src = placeholder(img.alt); }
  }, true);

  /* ---------- Estado ---------- */
  let cart = [], wish = [], PRICE_CAP = 0;
  const filters = { cat: "all", colors: new Set(), sizes: new Set(), maxPrice: Infinity, available: false, q: "", sort: "featured" };

  /* ---------- Toasts ---------- */
  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 2800);
  }

  /* ---------- Paneles y modales ---------- */
  const overlay = $("#overlay");
  function lock() { document.body.classList.add("lock"); overlay.classList.add("show"); }
  function closeAll() {
    $$(".drawer.open, .nav.open, .filters.open").forEach((d) => d.classList.remove("open"));
    if ($("#modal").classList.contains("open") && location.hash.startsWith("#p=")) history.replaceState(null, "", location.pathname + location.search);
    $("#modal").classList.remove("open");
    overlay.classList.remove("show");
    document.body.classList.remove("lock");
  }
  function openDrawer(id) { closeAll(); $(id).classList.add("open"); lock(); }
  function openModal(html, size = "") {
    $$(".drawer.open, .nav.open, .filters.open").forEach((d) => d.classList.remove("open"));
    $("#modalContent").innerHTML = html;
    $("#modalBox").className = "modal__box " + size;
    $("#modal").classList.add("open");
    $("#modalBox").scrollTop = 0;
    lock();
  }
  overlay.addEventListener("click", closeAll);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeAll(); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeAll(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });

  /* ---------- Categorías y filtros ---------- */
  const categories = () => [...new Set(PRODUCTS.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "es"));

  function buildCategories() {
    const cats = categories();
    const link = (c) => `<a href="#tienda" data-filter-cat="${esc(c)}">${esc(c)}</a>`;
    $("#navCats").innerHTML = cats.slice(0, 4).map(link).join("");
    $("#footerCats").innerHTML = cats.map(link).join("");
    $("#catFilters").innerHTML = [`<label><input type="radio" name="cat" value="all" checked> Todas</label>`,
      ...cats.map((c) => `<label><input type="radio" name="cat" value="${esc(c)}"> ${esc(c)}</label>`)].join("");
    $("#categorias").hidden = cats.length < 2;
    $("#categoryCards").innerHTML = cats.map((c) => {
      const items = PRODUCTS.filter((p) => p.category === c);
      const cover = items.find((p) => p.images.length) || items[0];
      return `<a href="#tienda" class="cat-card" data-filter-cat="${esc(c)}">
        <img src="${esc(coverOf(cover))}" alt="${esc(c)}" loading="lazy">
        <span>${esc(c)}</span><small>${items.length} prenda${items.length === 1 ? "" : "s"}</small></a>`;
    }).join("");
  }

  function buildFilters() {
    const colors = new Map();
    PRODUCTS.forEach((p) => colorsOf(p).forEach((c) => colors.set(c.name, c.hex)));
    $("#colorFilters").innerHTML = [...colors].sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([n, h]) => `<button type="button" style="background:${h}" data-color-f="${esc(n)}" title="${esc(n)}" aria-label="${esc(n)}"></button>`).join("");
    const order = ["XS", "S", "M", "L", "XL", "XXL"];
    const sizes = [...new Set(PRODUCTS.flatMap(sizesOf))].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia > -1 && ib > -1) return ia - ib;
      if (ia > -1) return -1; if (ib > -1) return 1;
      return isNaN(a) || isNaN(b) ? a.localeCompare(b) : a - b;
    });
    $("#sizeFilters").innerHTML = sizes.map((s) => `<button class="chip" data-size="${esc(s)}">${esc(s)}</button>`).join("");
    PRICE_CAP = PRODUCTS.length ? Math.ceil(Math.max(...PRODUCTS.map(minPrice)) / 1000) * 1000 : 0;
    filters.maxPrice = PRICE_CAP;
    const range = $("#priceRange");
    range.max = PRICE_CAP; range.step = 100; range.value = PRICE_CAP;
    $("#priceLabel").textContent = fmt(PRICE_CAP);
  }

  function bindFilters() {
    $("#catFilters").addEventListener("change", (e) => { filters.cat = e.target.value; renderGrid(); });
    $("#colorFilters").addEventListener("click", (e) => {
      const b = e.target.closest("[data-color-f]"); if (!b) return;
      const c = b.dataset.colorF;
      filters.colors.has(c) ? filters.colors.delete(c) : filters.colors.add(c);
      b.classList.toggle("active"); renderGrid();
    });
    $("#sizeFilters").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const s = b.dataset.size;
      filters.sizes.has(s) ? filters.sizes.delete(s) : filters.sizes.add(s);
      b.classList.toggle("active"); renderGrid();
    });
    $("#priceRange").addEventListener("input", (e) => { filters.maxPrice = +e.target.value; $("#priceLabel").textContent = fmt(filters.maxPrice); renderGrid(); });
    $("#availableOnly").addEventListener("change", (e) => { filters.available = e.target.checked; renderGrid(); });
    $("#sortSelect").addEventListener("change", (e) => { filters.sort = e.target.value; renderGrid(); });
    $("#clearFilters").addEventListener("click", clearFilters);
    $("#emptyClear").addEventListener("click", clearFilters);
    $("#filtersToggle").addEventListener("click", () => { $("#filters").classList.add("open"); lock(); });
    $("#filtersClose").addEventListener("click", closeAll);
    let t;
    $("#searchInput").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        filters.q = e.target.value.trim().toLowerCase();
        renderGrid();
        if (filters.q) $("#tienda").scrollIntoView({ behavior: "smooth" });
      }, 250);
    });
  }

  function syncFilterUI() {
    $$('input[name="cat"]').forEach((r) => (r.checked = r.value === filters.cat));
    $$("#colorFilters [data-color-f]").forEach((c) => c.classList.toggle("active", filters.colors.has(c.dataset.colorF)));
    $$("#sizeFilters .chip").forEach((c) => c.classList.toggle("active", filters.sizes.has(c.dataset.size)));
    $("#priceRange").value = filters.maxPrice;
    $("#priceLabel").textContent = fmt(filters.maxPrice);
    $("#availableOnly").checked = filters.available;
  }

  function clearFilters() {
    Object.assign(filters, { cat: "all", maxPrice: PRICE_CAP, available: false, q: "" });
    filters.colors.clear(); filters.sizes.clear();
    $("#searchInput").value = "";
    syncFilterUI(); renderGrid();
  }

  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function getFiltered() {
    const q = norm(filters.q);
    let list = PRODUCTS.filter((p) =>
      (filters.cat === "all" || p.category === filters.cat) &&
      (!filters.colors.size || p.variants.some((v) => filters.colors.has(v.color))) &&
      (!filters.sizes.size || p.variants.some((v) => filters.sizes.has(v.size) && v.stock !== "agotado")) &&
      minPrice(p) <= filters.maxPrice &&
      (!filters.available || status(p) !== "agotado") &&
      (!q || norm(`${p.name} ${p.design} ${p.category} ${p.brand} ${p.pattern} ${p.description} ${p.id} ${colorsOf(p).map((c) => c.name).join(" ")}`).includes(q))
    );
    const sorters = {
      "price-asc": (a, b) => minPrice(a) - minPrice(b),
      "price-desc": (a, b) => maxPrice(b) - maxPrice(a),
      name: (a, b) => a.name.localeCompare(b.name, "es")
    };
    if (sorters[filters.sort]) list = [...list].sort(sorters[filters.sort]);
    // Los agotados siempre al final
    return [...list].sort((a, b) => (status(a) === "agotado" ? 1 : 0) - (status(b) === "agotado" ? 1 : 0));
  }

  function renderActiveFilters() {
    const tags = [];
    if (filters.cat !== "all") tags.push(["cat", filters.cat]);
    filters.colors.forEach((c) => tags.push(["color:" + c, c]));
    filters.sizes.forEach((s) => tags.push(["size:" + s, "Talla " + s]));
    if (filters.available) tags.push(["available", "Disponibles"]);
    if (filters.maxPrice < PRICE_CAP) tags.push(["price", "Hasta " + fmt(filters.maxPrice)]);
    if (filters.q) tags.push(["q", `"${filters.q}"`]);
    $("#activeFilters").innerHTML = tags.map(([k, l]) => `<span class="tag">${esc(l)}<button data-rm="${esc(k)}" aria-label="Quitar">×</button></span>`).join("");
  }
  $("#activeFilters").addEventListener("click", (e) => {
    const k = e.target.dataset.rm; if (!k) return;
    if (k === "cat") filters.cat = "all";
    else if (k === "available") filters.available = false;
    else if (k === "price") filters.maxPrice = PRICE_CAP;
    else if (k === "q") { filters.q = ""; $("#searchInput").value = ""; }
    else if (k.startsWith("color:")) filters.colors.delete(k.slice(6));
    else if (k.startsWith("size:")) filters.sizes.delete(k.slice(5));
    syncFilterUI(); renderGrid();
  });

  /* ---------- Catálogo ---------- */
  const heart = `<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
  const priceHTML = (p) => minPrice(p) === maxPrice(p)
    ? `<strong>${fmt(minPrice(p))}</strong>` : `<small>Desde</small><strong>${fmt(minPrice(p))}</strong>`;

  function productCard(p, i) {
    const st = status(p);
    const badge = st === "agotado" ? `<span class="card__badge card__badge--agotado">Agotado</span>`
      : st === "pocas" ? `<span class="card__badge card__badge--pocas">Últimas unidades</span>`
      : isNew(p) ? `<span class="card__badge card__badge--nuevo">Nuevo</span>` : "";
    const id = esc(p.id);
    return `
      <article class="card ${st === "agotado" ? "card--soldout" : ""}" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="card__media" data-open="${id}">
          <img src="${esc(coverOf(p))}" alt="${esc(p.name)}" loading="lazy">
          ${badge}
          <button class="card__wish ${wish.includes(p.id) ? "active" : ""}" data-wish="${id}" aria-label="Favorito">${heart}</button>
          <button class="card__quick" data-open="${id}">Vista rápida</button>
        </div>
        <div class="card__body">
          <div class="card__type">${esc(p.category)}${p.design ? " · " + esc(p.design) : ""}</div>
          <h3 class="card__name" data-open="${id}">${esc(p.name)}</h3>
          <div class="price">${priceHTML(p)}</div>
          <div class="swatches">${colorsOf(p).map((c) => `<span class="swatch-dot" style="background:${c.hex}" title="${esc(c.name)}"></span>`).join("")}</div>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = getFiltered();
    $("#productGrid").innerHTML = list.map(productCard).join("");
    $("#emptyState").hidden = list.length > 0;
    $("#emptyText").textContent = PRODUCTS.length ? "😕 No encontramos productos con esos filtros." : "Pronto publicaremos nuestras prendas. ¡Vuelve pronto!";
    $("#emptyClear").hidden = !PRODUCTS.length;
    $("#resultsCount").textContent = `${list.length} producto${list.length !== 1 ? "s" : ""}`;
    renderActiveFilters();
  }

  document.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wish]");
    if (w) { e.stopPropagation(); toggleWish(w.dataset.wish); return; }
    const o = e.target.closest("[data-open]");
    if (o) openProduct(o.dataset.open);
  });

  /* ---------- Ficha de producto ---------- */
  function openProduct(id) {
    const p = byId(id); if (!p) return;
    const colors = colorsOf(p);
    const firstOpen = p.variants.find((v) => v.stock !== "agotado") || p.variants[0];
    const soldOut = status(p) === "agotado";
    const sel = { color: firstOpen.color, size: null, qty: 1, img: 0 };

    openModal(`
      <div class="pdp">
        <div class="pdp__img"><div class="main" id="pdpMain"></div><div class="pdp-thumbs" id="pdpThumbs"></div></div>
        <div class="pdp__info">
          <div class="card__type">${esc(p.category)}${p.brand ? " · " + esc(p.brand) : ""}</div>
          <h2>${esc(p.name)}</h2>
          ${p.design ? `<div class="muted">${esc(p.design)}</div>` : ""}
          <div class="price" id="pdpPrice"></div>
          ${p.description ? `<p class="pdp__desc">${esc(p.description)}</p>` : ""}
          <div class="pdp__opt">
            <h4>Color: <span id="selColor"></span></h4>
            <div class="color-opts">${colors.map((c) => `<button class="color-opt" style="background:${c.hex}" data-color="${esc(c.name)}" title="${esc(c.name)}" aria-label="${esc(c.name)}"></button>`).join("")}</div>
          </div>
          <div class="pdp__opt">
            <h4>Talla <a id="sizeGuideLink">Guía de tallas</a></h4>
            <div class="size-chips" id="pdpSizes"></div>
          </div>
          <div class="stock-note" id="stockNote"></div>
          <div class="pdp__actions">
            <div class="qty"><button data-q="-1" aria-label="Menos">−</button><span id="pdpQty">1</span><button data-q="1" aria-label="Más">+</button></div>
            <button class="btn btn--dark" id="pdpAdd" ${soldOut ? "disabled" : ""}>${soldOut ? "Agotado" : "Añadir al carrito"}</button>
            <button class="icon-btn card__wish ${wish.includes(p.id) ? "active" : ""}" style="position:static;box-shadow:none;border:1px solid var(--line)" data-wish="${esc(p.id)}" aria-label="Favorito">${heart}</button>
          </div>
          <div class="pdp__meta">
            <span>💬 Confirmamos tu pedido por WhatsApp</span>
            ${p.pattern ? `<span>Estampado: ${esc(p.pattern)}</span>` : ""}
            <span>Código: ${esc(p.id)} · <a href="#" id="shareLink" style="text-decoration:underline">Compartir</a></span>
          </div>
        </div>
      </div>`);

    const box = $("#modalContent");
    function update() {
      const imgs = imagesFor(p, sel.color);
      sel.img = Math.min(sel.img, Math.max(imgs.length - 1, 0));
      $("#pdpMain", box).innerHTML = `<img src="${esc(imgs.length ? imgs[sel.img].src : placeholder(p.name))}" alt="${esc(p.name + " " + sel.color)}">`;
      $("#pdpThumbs", box).innerHTML = imgs.length > 1 ? imgs.map((im, i) =>
        `<button class="${i === sel.img ? "active" : ""}" data-img="${i}" aria-label="Foto ${i + 1}"><img src="${esc(im.mini)}" alt=""></button>`).join("") : "";
      $$(".color-opt", box).forEach((b) => b.classList.toggle("active", b.dataset.color === sel.color));
      $("#selColor", box).textContent = sel.color;
      const sizes = sizesOf(p).filter((s) => variantOf(p, sel.color, s));
      $("#pdpSizes", box).innerHTML = sizes.map((s) => {
        const v = variantOf(p, sel.color, s);
        return `<button class="chip ${sel.size === s ? "active" : ""}" data-size="${esc(s)}" ${v.stock === "agotado" ? 'disabled title="Agotado"' : ""}>${esc(s)}</button>`;
      }).join("");
      const v = sel.size && variantOf(p, sel.color, sel.size);
      const prices = sizes.map((s) => variantOf(p, sel.color, s).price);
      const lo = Math.min(...prices), hi = Math.max(...prices);
      $("#pdpPrice", box).innerHTML = v ? `<strong>${fmt(v.price)}</strong>` : lo === hi ? `<strong>${fmt(lo)}</strong>` : `<strong>${fmt(lo)} – ${fmt(hi)}</strong>`;
      const note = $("#stockNote", box);
      const anyOpen = sizes.some((s) => variantOf(p, sel.color, s).stock !== "agotado");
      if (soldOut) { note.className = "stock-note low"; note.textContent = "✖ Agotado temporalmente"; }
      else if (!anyOpen) { note.className = "stock-note low"; note.textContent = "✖ Agotado en este color"; }
      else if (v && v.stock === "pocas") { note.className = "stock-note low"; note.textContent = `⚠️ ¡Últimas unidades en talla ${v.size}!`; }
      else if (v) { note.className = "stock-note"; note.textContent = "✔ Disponible"; }
      else { note.className = "stock-note"; note.textContent = "Elige tu talla"; }
      $("#pdpQty", box).textContent = sel.qty;
      if (!soldOut) {
        const btn = $("#pdpAdd", box);
        btn.disabled = !anyOpen;
        btn.textContent = v ? `Añadir al carrito · ${fmt(v.price * sel.qty)}` : "Añadir al carrito";
      }
    }
    $(".color-opts", box).addEventListener("click", (e) => {
      const b = e.target.closest(".color-opt"); if (!b) return;
      sel.color = b.dataset.color; sel.img = 0;
      const v = sel.size && variantOf(p, sel.color, sel.size);
      if (!v || v.stock === "agotado") sel.size = null;
      update();
    });
    $("#pdpThumbs", box).addEventListener("click", (e) => {
      const b = e.target.closest("[data-img]"); if (!b) return;
      sel.img = +b.dataset.img; update();
    });
    $("#pdpSizes", box).addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b || b.disabled) return;
      sel.size = b.dataset.size; update();
    });
    $(".qty", box).addEventListener("click", (e) => {
      const d = +e.target.dataset.q; if (!d) return;
      sel.qty = Math.max(1, Math.min(MAX_QTY, sel.qty + d)); update();
    });
    $("#sizeGuideLink", box).addEventListener("click", showSizeGuide);
    $("#shareLink", box).addEventListener("click", (e) => { e.preventDefault(); share(p); });
    $("#pdpAdd", box).addEventListener("click", () => {
      if (!sel.size) {
        toast("Por favor, selecciona una talla", "error");
        $("#pdpSizes", box).animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 300 });
        return;
      }
      const v = variantOf(p, sel.color, sel.size);
      if (addToCart(v.sku, sel.qty)) { closeAll(); setTimeout(() => openDrawer("#cartDrawer"), 150); }
    });
    update();
    history.replaceState(null, "", `#p=${encodeURIComponent(p.id)}`);
  }

  function share(p) {
    const url = location.href.split("#")[0] + `#p=${encodeURIComponent(p.id)}`;
    if (navigator.share) navigator.share({ title: p.name, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Enlace copiado", "success"));
  }

  function showSizeGuide() {
    openModal(`
      <div class="legal">
        <h2>Guía de tallas</h2>
        <p>Medidas referenciales del cuerpo en centímetros. Pueden variar según el modelo.</p>
        <table class="size-table">
          <tr><th>Talla</th><th>Pecho</th><th>Cintura</th><th>Cadera</th></tr>
          <tr><td>XS</td><td>80–84</td><td>62–66</td><td>86–90</td></tr>
          <tr><td>S</td><td>85–90</td><td>67–72</td><td>91–96</td></tr>
          <tr><td>M</td><td>91–96</td><td>73–80</td><td>97–102</td></tr>
          <tr><td>L</td><td>97–104</td><td>81–88</td><td>103–108</td></tr>
          <tr><td>XL</td><td>105–112</td><td>89–96</td><td>109–116</td></tr>
          <tr><td>XXL</td><td>113–120</td><td>97–106</td><td>117–124</td></tr>
        </table>
        <p style="margin-top:1rem">💡 Si tienes dudas con tu talla, escríbenos por WhatsApp y te ayudamos.</p>
      </div>`, "sm");
  }

  /* ---------- Favoritos ---------- */
  function toggleWish(id) {
    const p = byId(id); if (!p) return;
    if (wish.includes(id)) { wish = wish.filter((x) => x !== id); toast("Eliminado de favoritos"); }
    else { wish.push(id); toast(`❤️ ${p.name} añadido a favoritos`); }
    ls.set("wish", wish);
    $$("[data-wish]").forEach((b) => { if (b.dataset.wish === id) b.classList.toggle("active", wish.includes(id)); });
    renderWish();
  }
  function renderWish() {
    const c = $("#wishCount");
    c.textContent = wish.length; c.hidden = !wish.length;
    $("#wishItems").innerHTML = wish.length ? wish.map((id) => {
      const p = byId(id);
      return `<div class="line-item">
        <img src="${esc(coverOf(p))}" alt="${esc(p.name)}">
        <div><h5>${esc(p.name)}</h5><small>${esc(p.category)}</small><strong>${fmt(minPrice(p))}</strong><br>
          <button class="btn btn--dark btn--sm" style="margin-top:.5rem" data-open="${esc(p.id)}">Ver producto</button></div>
        <div class="line-item__right"><button class="remove-btn" data-wish="${esc(p.id)}">Quitar</button></div>
      </div>`;
    }).join("") : `<div class="drawer-empty"><div class="big">🤍</div><p>Aún no tienes favoritos.</p><button class="btn btn--dark" data-close>Explorar tienda</button></div>`;
  }

  /* ---------- Carrito ---------- */
  function addToCart(sku, qty = 1) {
    const { p, v } = BY_SKU.get(sku);
    const item = cart.find((i) => i.sku === sku);
    const current = item ? item.qty : 0;
    if (current + qty > MAX_QTY) { toast(`Máximo ${MAX_QTY} unidades por prenda. Para más, escríbenos por WhatsApp.`, "error"); return false; }
    item ? (item.qty += qty) : cart.push({ sku, qty });
    saveCart();
    toast(`🛍️ ${p.name} (${v.color}, ${v.size}) añadido al carrito`, "success");
    const c = $("#cartCount"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
    return true;
  }
  function saveCart() { ls.set("cart", cart); renderCart(); }
  function calcTotals() {
    return {
      total: cart.reduce((s, i) => s + BY_SKU.get(i.sku).v.price * i.qty, 0),
      items: cart.reduce((s, i) => s + i.qty, 0)
    };
  }
  function totalsHTML(t) {
    return `
      <div><span>Subtotal (${t.items})</span><span>${fmt(t.total)}</span></div>
      <div><span>Entrega</span><span>Se coordina por WhatsApp</span></div>
      <div class="grand"><span>Total</span><span>${fmt(t.total)}</span></div>`;
  }

  function renderCart() {
    const t = calcTotals();
    const c = $("#cartCount");
    c.textContent = t.items; c.hidden = !t.items;
    $("#cartFoot").hidden = !cart.length;
    $("#cartItems").innerHTML = cart.length ? cart.map((i) => {
      const { p, v } = BY_SKU.get(i.sku);
      const img = imagesFor(p, v.color)[0];
      const sku = esc(i.sku);
      return `<div class="line-item">
        <img src="${esc(img ? img.mini : placeholder(p.name))}" alt="${esc(p.name)}" data-open="${esc(p.id)}" style="cursor:pointer">
        <div>
          <h5>${esc(p.name)}</h5>
          <small>Talla: ${esc(v.size)} · Color: ${esc(v.color)}</small>
          <small>${fmt(v.price)} c/u${v.stock === "pocas" ? " · últimas unidades" : ""}</small>
          <div class="qty"><button data-cq="-1" data-sku="${sku}" aria-label="Menos">−</button><span>${i.qty}</span><button data-cq="1" data-sku="${sku}" aria-label="Más">+</button></div>
        </div>
        <div class="line-item__right"><strong>${fmt(v.price * i.qty)}</strong><button class="remove-btn" data-rm-item="${sku}">Eliminar</button></div>
      </div>`;
    }).join("") : `<div class="drawer-empty"><div class="big">🛍️</div><p>Tu carrito está vacío.</p><button class="btn btn--dark" data-close>Empezar a comprar</button></div>`;
    $("#cartTotals").innerHTML = totalsHTML(t);
  }

  $("#cartItems").addEventListener("click", (e) => {
    const q = e.target.closest("[data-cq]");
    const r = e.target.closest("[data-rm-item]");
    if (q) {
      const item = cart.find((i) => i.sku === q.dataset.sku);
      const d = +q.dataset.cq;
      if (d > 0 && item.qty >= MAX_QTY) return toast(`Máximo ${MAX_QTY} unidades por prenda`, "error");
      item.qty += d;
      if (item.qty <= 0) cart = cart.filter((i) => i !== item);
      saveCart();
    }
    if (r) { cart = cart.filter((i) => i.sku !== r.dataset.rmItem); saveCart(); toast("Producto eliminado"); }
  });

  /* ---------- Checkout ---------- */
  $("#checkoutBtn").addEventListener("click", openCheckout);

  function openCheckout() {
    if (!cart.length) return;
    const t = calcTotals();
    const saved = ls.get("customer", {});
    const v = (k) => esc(saved[k] || "");
    openModal(`
      <div class="checkout">
        <h2>Finalizar compra</h2>
        <p class="muted">Completa tus datos. Al confirmar, envías el pedido por WhatsApp y te respondemos para coordinar el pago y la entrega.</p>
        <form class="form" id="checkoutForm" novalidate>
          <label class="lbl">Datos de contacto</label>
          <div class="row">
            <input name="name" placeholder="Nombre y apellidos *" required value="${v("name")}" autocomplete="name" maxlength="80">
            <input name="phone" type="tel" placeholder="Celular *" required pattern="[0-9+\\s()-]{7,}" value="${v("phone")}" autocomplete="tel" maxlength="20">
          </div>
          <label class="lbl">Entrega</label>
          <div class="pay-opts">
            <label class="pay-opt"><input type="radio" name="delivery" value="Recojo en tienda" ${saved.delivery !== "Delivery" ? "checked" : ""}><div><strong>🏬 Recojo en tienda</strong><small>${esc(STORE.address || "Te indicamos la dirección por WhatsApp")}</small></div></label>
            <label class="pay-opt"><input type="radio" name="delivery" value="Delivery" ${saved.delivery === "Delivery" ? "checked" : ""}><div><strong>🛵 Delivery</strong><small>El costo depende de tu distrito</small></div></label>
          </div>
          <div id="addressFields" ${saved.delivery === "Delivery" ? "" : "hidden"}>
            <div class="row">
              <input name="address" placeholder="Dirección *" value="${v("address")}" autocomplete="street-address" maxlength="140">
              <input name="district" placeholder="Distrito *" value="${v("district")}" autocomplete="address-level2" maxlength="60">
            </div>
          </div>
          <label class="lbl">¿Cómo prefieres pagar?</label>
          <select name="payment">
            ${["Yape", "Plin", "Transferencia bancaria", "Efectivo"].map((m) => `<option ${saved.payment === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
          <textarea name="notes" rows="2" placeholder="Comentario (opcional)" maxlength="300"></textarea>
          <div class="summary">
            ${cart.map((i) => { const { p, v: x } = BY_SKU.get(i.sku); return `<div class="mini"><span>${i.qty}× ${esc(p.name)} (${esc(x.size)}, ${esc(x.color)})</span><span>${fmt(x.price * i.qty)}</span></div>`; }).join("")}
            <div class="totals">${totalsHTML(t)}</div>
          </div>
          <label class="legal-check"><input type="checkbox" name="terms" required> <span>Acepto los <a href="#" data-legal="terminos" style="text-decoration:underline">términos</a> y la <a href="#" data-legal="privacidad" style="text-decoration:underline">política de privacidad</a>.</span></label>
          <button class="btn btn--dark btn--block" type="submit" id="placeOrder">Confirmar pedido · ${fmt(t.total)}</button>
        </form>
      </div>`, "sm");

    const form = $("#checkoutForm");
    const toggleAddress = () => {
      const delivery = form.delivery.value === "Delivery";
      $("#addressFields").hidden = !delivery;
      form.address.required = delivery; form.district.required = delivery;
    };
    form.addEventListener("change", (e) => { if (e.target.name === "delivery") toggleAddress(); });
    form.addEventListener("input", (e) => e.target.classList.remove("invalid"));
    form.addEventListener("submit", placeOrder);
    toggleAddress();
  }

  function validate(form) {
    let ok = true;
    $$("input[required], textarea[required]", form).forEach((el) => {
      const valid = el.type === "checkbox" ? el.checked : el.checkValidity() && el.value.trim() !== "";
      el.classList.toggle("invalid", !valid);
      if (!valid) ok = false;
    });
    return ok;
  }

  function placeOrder(e) {
    e.preventDefault();
    const form = e.target;
    if (!validate(form)) {
      toast(form.terms.checked ? "Revisa los campos marcados en rojo" : "Completa los campos y acepta los términos", "error");
      $(".invalid", form)?.focus();
      return;
    }
    const d = Object.fromEntries(new FormData(form));
    const customer = { name: d.name.trim(), phone: d.phone.trim(), delivery: d.delivery, payment: d.payment,
                       address: (d.address || "").trim(), district: (d.district || "").trim() };
    ls.set("customer", customer);
    const order = {
      id: "W-" + Date.now().toString(36).toUpperCase().slice(-6),
      date: new Date().toISOString(),
      customer, notes: (d.notes || "").trim(), status: "Enviado por WhatsApp",
      total: calcTotals().total,
      items: cart.map((i) => { const { p, v } = BY_SKU.get(i.sku); return { id: p.id, sku: v.sku, name: p.name, size: v.size, color: v.color, qty: i.qty, price: v.price }; })
    };
    const orders = ls.get("orders", []);
    orders.unshift(order);
    ls.set("orders", orders.slice(0, 20));
    cart = []; saveCart(); renderOrders();
    showSuccess(order);
  }

  function orderText(o) {
    const lines = o.items.map((i) => `• ${i.qty}x ${i.name} (${i.id}) – Talla ${i.size}, ${i.color} – ${fmt(i.price * i.qty)}`).join("\n");
    const c = o.customer;
    return `Hola ${STORE.name}, quiero hacer este pedido:\n\n🛍️ *PEDIDO ${o.id}*\n${lines}\n\n*TOTAL: ${fmt(o.total)}*\n\n` +
      `👤 ${c.name}\n📞 ${c.phone}\n🚚 ${c.delivery}` +
      (c.delivery === "Delivery" ? `\n📍 ${c.address}, ${c.district}` : "") +
      `\n💳 Pago: ${c.payment}` + (o.notes ? `\n📝 ${o.notes}` : "") + `\n\n(Pedido desde la página web)`;
  }
  const waLink = (o) => `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(orderText(o))}`;

  function showSuccess(o) {
    openModal(`
      <div class="success">
        <div class="check">✓</div>
        <h2>¡Gracias, ${esc(o.customer.name.split(" ")[0])}!</h2>
        <p class="muted">Tu pedido está listo para enviar.</p>
        <div class="order-no">Pedido ${esc(o.id)}</div>
        <p>Total: <strong>${fmt(o.total)}</strong> · Pago: ${esc(o.customer.payment)}</p>
        <p class="muted" style="margin-top:1rem">👉 <strong>Último paso:</strong> envíanos el pedido por WhatsApp para confirmarlo y coordinar el pago y la entrega.</p>
        <div class="btns">
          <a class="btn btn--whatsapp" style="margin:0" href="${esc(waLink(o))}" target="_blank" rel="noopener">💬 Enviar pedido por WhatsApp</a>
          <button class="btn btn--outline" data-close>Seguir comprando</button>
        </div>
      </div>`, "sm");
  }

  /* ---------- Mis pedidos ---------- */
  function renderOrders() {
    const orders = ls.get("orders", []).filter((o) => o && Array.isArray(o.items) && o.customer);
    $("#ordersList").innerHTML = orders.length ? orders.map((o) => `
      <div class="order-card">
        <header><strong>${esc(o.id)}</strong><span class="status">${esc(o.status)}</span></header>
        <div class="muted">${esc(new Date(o.date).toLocaleString("es-PE"))}</div>
        <div style="margin:.5rem 0">${o.items.map((i) => `${+i.qty || 0}× ${esc(i.name)} (${esc(i.size)}, ${esc(i.color)})`).join("<br>")}</div>
        <div><strong>Total: ${fmt(+o.total || 0)}</strong> · ${esc(o.customer.payment)}</div>
        <a class="btn btn--whatsapp btn--sm" style="margin-top:.6rem" href="${esc(waLink(o))}" target="_blank" rel="noopener">Reenviar por WhatsApp</a>
      </div>`).join("") : `<div class="drawer-empty"><div class="big">📦</div><p>Aún no has realizado pedidos.</p></div>`;
    const hasData = orders.length || ls.get("customer", null) || cart.length || wish.length;
    if (hasData) {
      $("#ordersList").insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:.8rem;margin-top:1rem">Tus datos y pedidos se guardan solo en este dispositivo, nunca en nuestros servidores.</p>
        <button class="btn btn--outline btn--sm btn--block" data-clear-data>🗑️ Borrar mis datos de este dispositivo</button>`);
    }
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear-data]")) return;
    if (!confirm("¿Borrar tu nombre, teléfono, dirección, pedidos, carrito y favoritos guardados en este dispositivo?")) return;
    ["customer", "orders", "cart", "wish"].forEach((k) => { try { localStorage.removeItem("tienda_" + k); } catch { /* sin acceso */ } });
    cart = []; wish = [];
    renderCart(); renderWish(); renderOrders(); renderGrid();
    toast("Tus datos se borraron de este dispositivo", "success");
  });

  /* ---------- Textos legales ---------- */
  function legal(key) {
    const name = esc(STORE.name);
    const L = {
      pedidos: `<h2>Pedidos y entregas</h2>
        <h4>Pedidos</h4><p>Los pedidos de la web se envían por WhatsApp. Un pedido queda confirmado cuando te respondemos verificando la disponibilidad y el total.</p>
        <h4>Entregas</h4><p>Puedes recoger tu pedido en tienda o pedir delivery. El costo y el tiempo del delivery dependen de tu distrito y se coordinan por WhatsApp antes del pago.</p>
        <h4>Cambios</h4><p>Escríbenos por WhatsApp indicando tu número de pedido y te indicamos las opciones.</p>`,
      terminos: `<h2>Términos y condiciones</h2>
        <p>Al realizar un pedido en ${name} aceptas las siguientes condiciones:</p>
        <ul><li>Los precios están en soles (S/).</li><li>El pedido se considera confirmado tras nuestra validación por WhatsApp.</li><li>Si una prenda se agota antes de confirmar, te avisamos y no se cobra.</li><li>Las imágenes son referenciales; los colores pueden variar ligeramente según la pantalla.</li></ul>`,
      privacidad: `<h2>Política de privacidad</h2>
        <p>${name} usa tus datos (nombre, celular y dirección) solo para atender tu pedido. Esta web no guarda tus datos en ningún servidor: se envían directamente por WhatsApp.</p>
        <h4>Almacenamiento local</h4><p>Tu navegador recuerda tu carrito, favoritos y pedidos para que no los pierdas. No usamos cookies de seguimiento ni servicios de terceros. Puedes borrarlos cuando quieras desde «Mis pedidos» → «Borrar mis datos de este dispositivo».</p>`
    };
    return L[key] || "";
  }
  document.addEventListener("click", (e) => {
    const l = e.target.closest("[data-legal]");
    if (l) { e.preventDefault(); openModal(`<div class="legal">${legal(l.dataset.legal)}</div>`, "sm"); }
  });

  /* ---------- Navegación ---------- */
  $("#burgerBtn").addEventListener("click", () => { $("#nav").classList.add("open"); lock(); });
  $("#cartBtn").addEventListener("click", () => openDrawer("#cartDrawer"));
  $("#wishBtn").addEventListener("click", () => openDrawer("#wishDrawer"));
  $("#ordersBtn").addEventListener("click", () => { renderOrders(); openDrawer("#ordersDrawer"); });
  $("#searchToggle").addEventListener("click", () => {
    const sb = $("#searchbar"); sb.classList.toggle("open");
    if (sb.classList.contains("open")) setTimeout(() => $("#searchInput").focus(), 200);
  });
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-filter-cat]");
    if (c) {
      clearFilters();
      filters.cat = c.dataset.filterCat;
      syncFilterUI(); renderGrid(); closeAll();
    } else if (e.target.closest(".nav a")) closeAll();
  });

  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    if (!validate(form)) return toast("Completa todos los campos", "error");
    const d = Object.fromEntries(new FormData(form));
    const text = `Hola ${STORE.name}, soy ${d.name.trim()}.\n\n${d.message.trim()}`;
    window.open(`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    form.reset();
  });

  /* ---------- Inicio ---------- */
  $("#year").textContent = new Date().getFullYear();
  bindFilters();
  fetch(CATALOGO, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      STORE = data.store || {};
      PRODUCTS = (data.products || []).filter((p) => p.variants && p.variants.length);
      PRODUCTS.forEach((p) => p.variants.forEach((v) => BY_SKU.set(v.sku, { p, v })));
      if (data.updated) $("#updated").textContent = `· Catálogo actualizado el ${data.updated}`;
      // Carrito y favoritos guardados: solo lo que sigue existiendo y disponible
      const before = ls.get("cart", []);
      cart = (Array.isArray(before) ? before : [])
        .filter((i) => i && BY_SKU.has(i.sku) && BY_SKU.get(i.sku).v.stock !== "agotado")
        .map((i) => ({ sku: i.sku, qty: Math.min(MAX_QTY, Math.max(1, parseInt(i.qty, 10) || 1)) }));
      if (Array.isArray(before) && cart.length < before.length) toast("Algunas prendas de tu carrito ya no están disponibles y se quitaron.");
      wish = (ls.get("wish", []) || []).filter((id) => byId(id));
      buildCategories();
      buildFilters();
      renderGrid();
      renderCart();
      renderWish();
      renderOrders();
      const m = location.hash.match(/^#p=(.+)$/);
      if (m) openProduct(decodeURIComponent(m[1]));
    })
    .catch(() => {
      $("#productGrid").innerHTML = `<p class="muted">No se pudo cargar el catálogo. Revisa tu conexión y vuelve a intentar.</p>`;
    });
})();
