

// Fetch and render products from the backend
let products = []; // Global array for cart logic
let allProducts = []; // Master array for all products

// ── Site config cache (populated once on load from backend/config.php) ────────
let _siteConfig = null;
async function loadSiteConfig() {
  if (_siteConfig) return _siteConfig;
  try {
    _siteConfig = await fetch('backend/config.php').then(r => r.json());
  } catch {
    _siteConfig = {};
  }
  return _siteConfig;
}

/** API may return id as string or number — avoid strict === mismatches */
function findProductById(id) {
  const n = Number(id);
  return allProducts.find((p) => Number(p.id) === n);
}

/**
 * Escape user/DB-sourced strings before injecting into innerHTML.
 * Covers &, <, >, ", ' — prevents all standard XSS injection vectors.
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Loaded from backend/settings.php (0 when VAT off, 0.12 when on — Lebanon 2026) */
let currentTaxRate = 0;

async function refreshTaxSettings() {
  try {
    const res = await fetch('backend/settings.php');
    const data = await res.json();
    if (data.success && typeof data.currentTaxRate === 'number') {
      currentTaxRate = data.currentTaxRate;
    }
  } catch {
    currentTaxRate = 0;
  }
}

function getCartSubtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function computeCheckoutTax(subtotal) {
  return Math.round(Math.max(0, subtotal) * currentTaxRate * 100) / 100;
}

function computeShippingFee(shippingMethod, subtotal) {
  const s = Math.max(0, subtotal);
  if (shippingMethod === 'express') {
    return Math.round((12.99 + s * 0.02) * 100) / 100;
  }
  return Math.round((5.99 + s * 0.01) * 100) / 100;
}

/**
 * Validates Lebanese phone numbers and common international formats.
 * Accepted separators (stripped before testing): spaces, dashes, dots, +, parentheses.
 *
 * Lebanese local (8 digits):
 *   Mobile  — 03, 70, 71, 76, 78, 79, 81, 82, 86  + 6 digits
 *   Landline— 01, 04, 05, 06, 07, 08, 09           + 6 digits
 *
 * Lebanese with country code (+961 / 00961):
 *   Mobile   → +961 71 234 567 → 11 digits (961 + 8)
 *   Landline → +961 1 234 567  → 10 digits (961 + 7, leading 0 of area code is dropped)
 *
 * International fallback: any number resolving to 10–15 digits.
 */
function isValidPhone(value) {
  const digits = String(value).replace(/[\s\-()+.]/g, '');

  // Must be purely numeric after stripping separators
  if (!/^\d+$/.test(digits)) return false;

  // Lebanese with country code 961 (mobile: 11 digits, landline: 10 digits)
  if (/^961\d{7,8}$/.test(digits)) return true;

  // Lebanese local — 8 digits:
  //   0[13-9]  → 01 (Beirut), 03 (Alfa mobile), 04-09 (regional landlines)
  //   7[01689] → 70, 71 (Touch), 76, 78, 79 (Alfa)
  //   8[126]   → 81 (Touch), 82, 86
  if (/^(0[13-9]|7[01689]|8[126])\d{6}$/.test(digits)) return true;

  // International fallback: 10–15 digits
  return digits.length >= 10 && digits.length <= 15;
}

// Render products (used for search and initial display)
function renderProducts(productList) {
  const productsGrid = document.querySelector('#products .products-grid');
  productsGrid.innerHTML = '';
  if (productList.length) {
    productList.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      const safeName  = escapeHtml(product.name);
      const safeDesc  = escapeHtml(product.description);
      const safeImage = escapeHtml(product.image);
      const safeId    = Number(product.id); // always a DB integer
      card.innerHTML = `
        <img src="${safeImage}" alt="${safeName}">
        <h3>${safeName}</h3>
        <p>${safeDesc}</p>
        <div class="price">$${parseFloat(product.price).toFixed(2)}</div>
        <div class="quantity-selector">
          <button class="quantity-btn minus">-</button>
          <input type="number" min="1" value="1" class="quantity-input">
          <button class="quantity-btn plus">+</button>
        </div>
        <button type="button" class="btn add-to-cart">Add to Cart</button>
        <button type="button" class="btn usage-details-btn" data-id="${safeId}">Usage &amp; Details</button>
      `;
      productsGrid.appendChild(card);
    });
  } else {
    productsGrid.innerHTML = '<p>No products found.</p>';
  }
}

// handle the product usage modal — scroll lock only after overlay is shown (see styles.css body > * fix)
const usageModalEl = document.getElementById('usageDetailsModal');
function disableBodyScroll() {
  document.body.style.overflow = 'hidden';
}
function enableBodyScroll() {
  document.body.style.overflow = '';
}

function openUsageModal(product) {
  if (!usageModalEl || !product) return false;
  // textContent is already used here — safe ✅
  document.getElementById('usageDetailsTitle').textContent = product.name + ' - Usage & Details';
  // Escape first, then convert newlines to <br> — preserves formatting without XSS risk
  const raw = product.usage || product.details || 'No details available.';
  document.getElementById('usageDetailsBody').innerHTML = escapeHtml(raw).replace(/(?:\r\n|\r|\n)/g, '<br>');
  usageModalEl.style.display = 'flex';
  disableBodyScroll();
  return true;
}

function closeUsageModal() {
  if (!usageModalEl) return;
  usageModalEl.style.display = 'none';
  enableBodyScroll();
}

document.addEventListener('click', function(e) {
  const usageBtn = e.target.closest('.usage-details-btn');
  if (usageBtn) {
    e.preventDefault();
    e.stopPropagation();
    const product = findProductById(usageBtn.getAttribute('data-id'));
    if (product) openUsageModal(product);
    return;
  }
  if (e.target.id === 'closeUsageModal' || e.target.id === 'usageDetailsModal') {
    e.stopPropagation();
    closeUsageModal();
  }
});



// After fetching products, show all by default
fetchAndRenderProducts = async function() {
  const res = await fetch('backend/products.php');
  const data = await res.json();
  const productsGrid = document.querySelector('#products .products-grid');
  productsGrid.innerHTML = '';
  if (data.success && data.products.length) {
    products = data.products; // Save for cart logic
    allProducts = data.products; // Save all products for lookup
    renderProducts(products);
  } else {
    productsGrid.innerHTML = '<p>No products available.</p>';
  }
}

// SEARCH BAR
const productSearchInput = document.getElementById('productSearch');
if (productSearchInput) {
  productSearchInput.addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    const filteredProducts = allProducts.filter(product =>
      product.name.toLowerCase().includes(searchTerm)
    );
    renderProducts(filteredProducts);
  });
}
// --- End Product Search Functionality ---

fetchAndRenderProducts();

// Cart Logic
let cart = [];
const cartCount = document.querySelector('.cart-count');
const cartModal = document.getElementById('cartModal');
const cartItemsDiv = document.querySelector('.cart-items');
const cartTotalDiv = document.querySelector('.cart-total');
const closeCartBtn = document.getElementById('closeCart');
// checkout modal
const checkoutBtn = document.getElementById('checkoutBtn');
const checkoutModal = document.getElementById('checkoutModal');
const closeCheckout = document.getElementById('closeCheckout');



if (closeCheckout && checkoutModal) {
  closeCheckout.addEventListener('click', function() {
    checkoutModal.style.display = 'none';
    document.body.style.overflow = ''; // Restore page scroll
  });
}


if (checkoutBtn && checkoutModal) {
  checkoutBtn.addEventListener('click', async function() {
    document.body.style.overflow = 'hidden';
    document.getElementById('cartModal').classList.remove('active');
    await refreshTaxSettings();
    checkoutModal.style.display = 'flex';
    renderOrderSummary();
  });
}

// Close checkout modal when clicking outside the form
if (checkoutModal) {
  checkoutModal.addEventListener('click', function(e) {
    if (e.target === checkoutModal) {
      checkoutModal.style.display = 'none';
      document.body.style.overflow = '';
    }
  });
}






function addToCart(productId, qty) {
// Find the product in the global products array
  const product = findProductById(productId);
  if (!product) {
    alert('Product not found!');
    return;
  }
  const name = product.name;
  const price = parseFloat(product.price);
  const img = product.image;
  qty = parseInt(qty) || 1;

  const pid = Number(productId);
  const existing = cart.find((item) => Number(item.id) === pid);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: pid, name, price, img, qty });
  }
  updateCartCount();
  showCartModal();
}
window.addToCart = addToCart;




checkoutForm = document.getElementById('checkoutForm');

// ── postOrder: send validated order to the backend ───────────────────────────
// Called by the card flow (via form submit) and the PayPal flow (via onApprove).
async function postOrder(lat, lng, paypalOrderId = '') {
  if (!checkoutForm) return;
  const phone = checkoutForm.phone.value.trim();
  if (!isValidPhone(phone)) return;

  checkoutForm.latitude.value  = lat != null ? String(lat) : '';
  checkoutForm.longitude.value = lng != null ? String(lng) : '';

  const subtotal    = getCartSubtotal();
  const shipMethod  = checkoutForm.shipping_method.value || 'standard';
  const tax         = computeCheckoutTax(subtotal);
  const shippingFee = computeShippingFee(shipMethod, subtotal);
  const grandTotal  = Math.round((subtotal + tax + shippingFee) * 100) / 100;

  const orderData = {
    customer_name:    checkoutForm.customer_name.value.trim(),
    customer_email:   checkoutForm.customer_email.value.trim(),
    phone,
    street_address:   checkoutForm.street_address.value.trim(),
    city:             checkoutForm.city.value.trim(),
    state:            checkoutForm.state.value.trim(),
    zip:              checkoutForm.zip.value.trim(),
    country:          checkoutForm.country.value,
    shipping_method:  checkoutForm.shipping_method.value,
    payment_method:   checkoutForm.payment_method.value,
    cardholder_name:  checkoutForm.cardholder_name ? checkoutForm.cardholder_name.value.trim() : '',
    tax,
    shipping_fee:     shippingFee,
    total:            grandTotal,
    tracking_number:  checkoutForm.tracking_number ? checkoutForm.tracking_number.value.trim() : '',
    paypal_order_id:  paypalOrderId,
    location:         checkoutForm.location ? checkoutForm.location.value.trim() : '',
    latitude:         checkoutForm.latitude.value,
    longitude:        checkoutForm.longitude.value,
    cart:             cart
  };

  let res;
  try {
    res = await fetch('backend/orders.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
  } catch (err) {
    alert('Network error — could not reach server. Check URL and that Apache is running.\n' + err.message);
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (data.success) {
    const orderId    = data.order_id || '';
    const totalLabel = `$${grandTotal.toFixed(2)}`;

    // Populate the order summary line
    const detailsEl = checkoutModal.querySelector('#thank-you-order-details');
    if (detailsEl) {
      detailsEl.textContent = orderId
        ? `Order #${orderId} · Total ${totalLabel}`
        : `Total: ${totalLabel}`;
    }

    // Build the WhatsApp confirm button
    const wrapper = checkoutModal.querySelector('#whatsapp-confirm-wrapper');
    if (wrapper) {
      const cfg   = await loadSiteConfig();
      const waNum = (cfg.whatsapp_number || '').replace(/\D/g, '');
      if (waNum) {
        const msg = encodeURIComponent(
          `Hello! I just placed Order #${orderId} for ${totalLabel} on GymSupps Store. Please confirm my order. Thank you! 🙏`
        );
        wrapper.innerHTML = `
          <a href="https://wa.me/${waNum}?text=${msg}"
             target="_blank" rel="noopener noreferrer"
             style="display:inline-flex;align-items:center;gap:9px;
                    background:#25D366;color:#fff;border-radius:6px;
                    padding:11px 22px;text-decoration:none;font-weight:bold;font-size:0.95rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 32 32" fill="white" aria-hidden="true">
              <path d="M16 0C7.163 0 0 7.163 0 16c0 2.826.738 5.476 2.031 7.787L0 32l8.464-2.004A15.93 15.93 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm8.232 22.515c-.346.972-2.01 1.858-2.764 1.976-.708.11-1.608.157-2.59-.163-.598-.19-1.365-.445-2.35-.87-4.132-1.79-6.83-5.995-7.035-6.272-.207-.277-1.68-2.234-1.68-4.261 0-2.027 1.062-3.02 1.44-3.428.377-.407.82-.51 1.094-.51.274 0 .548.003.787.014.253.012.592-.096.927.707.346.824 1.177 2.85 1.28 3.056.104.206.17.447.034.72-.138.274-.207.443-.41.683-.206.24-.433.536-.618.72-.207.207-.42.432-.182.847.24.415 1.065 1.757 2.287 2.847 1.573 1.4 2.896 1.834 3.31 2.04.414.207.655.173.895-.104.24-.277 1.027-1.2 1.3-1.61.275-.41.548-.343.924-.207.377.138 2.39 1.128 2.8 1.334.41.207.685.31.785.483.103.172.103 1 .001 1.972z"/>
            </svg>
            Confirm via WhatsApp
          </a>`;
      }
    }

    // Done button closes the modal and resets state
    const doneBtn    = checkoutModal.querySelector('#thank-you-done-btn');
    const closeModal = () => {
      checkoutModal.querySelector('.thank-you-message').style.display = 'none';
      checkoutModal.style.display  = 'none';
      checkoutForm.style.display   = '';
      document.body.style.overflow = '';
      if (wrapper) wrapper.innerHTML = '';
      cart.length = 0;
      updateCartCount();
    };
    if (doneBtn) doneBtn.onclick = closeModal;

    checkoutModal.querySelector('.thank-you-message').style.display = 'block';
    checkoutForm.style.display = 'none';
  } else {
    alert('Order failed: ' + (data.error || res.statusText || 'Unknown error'));
  }
}

// ── PayPal integration ────────────────────────────────────────────────────────
let _paypalButtonsRendered = false;

async function setupPaypalButtons() {
  const container = document.getElementById('paypal-buttons-container');
  if (!container || _paypalButtonsRendered) return;

  // Fetch public client-id from backend (keeps the secret server-side)
  let clientId = '', currency = 'USD';
  try {
    const cfg = await fetch('backend/config.php').then(r => r.json());
    clientId = cfg.paypal_client_id || '';
    currency = cfg.currency         || 'USD';
  } catch {
    container.innerHTML = '<p style="color:red;font-size:.85rem;">Could not reach PayPal config endpoint.</p>';
    return;
  }

  if (!clientId) {
    container.innerHTML = '<p style="color:red;font-size:.85rem;">PayPal is not configured — add PAYPAL_CLIENT_ID to .env.</p>';
    return;
  }

  // Lazy-load the PayPal JS SDK
  await new Promise((resolve, reject) => {
    if (window.paypal) { resolve(); return; }
    const s    = document.createElement('script');
    s.src      = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&components=buttons`;
    s.onload   = resolve;
    s.onerror  = () => reject(new Error('Failed to load PayPal SDK'));
    document.head.appendChild(s);
  }).catch(err => {
    container.innerHTML = `<p style="color:red;font-size:.85rem;">${err.message}</p>`;
    return Promise.reject(err);
  });

  window.paypal.Buttons({
    style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay', height: 40 },

    // Step 1 — validate the form, then ask our server to create a PayPal order
    createOrder: async function () {
      // HTML5 + phone validation before opening the PayPal popup
      if (checkoutForm && !checkoutForm.reportValidity()) {
        throw new Error('Please fill in all required fields before paying.');
      }
      const phone = checkoutForm ? checkoutForm.phone.value.trim() : '';
      if (!isValidPhone(phone)) {
        if (checkoutForm) checkoutForm.phone.focus();
        alert('Please enter a valid phone number (e.g. 71 234 567, 03 123 456, or +961 71 234 567).');
        throw new Error('Invalid phone number');
      }

      await refreshTaxSettings();
      const subtotal    = getCartSubtotal();
      const shipMethod  = checkoutForm ? (checkoutForm.shipping_method.value || 'standard') : 'standard';
      const tax         = computeCheckoutTax(subtotal);
      const shippingFee = computeShippingFee(shipMethod, subtotal);
      const grandTotal  = Math.round((subtotal + tax + shippingFee) * 100) / 100;

      // Sanity-check the amount before hitting the server
      if (grandTotal <= 0) {
        alert('Your cart appears to be empty. Please add items before paying.');
        throw new Error('Cart total is zero');
      }

      console.log('[PayPal] createOrder → amount:', grandTotal, '| currency:', currency);

      const res  = await fetch('backend/paypal.php?action=create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: grandTotal }),
      });
      const json = await res.json();

      if (!res.ok || !json.id) {
        // Surface the exact server error so it's visible in DevTools console
        console.error('[PayPal] createOrder failed — HTTP', res.status, ':', json);
        throw new Error(json.error || 'Could not create PayPal order');
      }
      return json.id;
    },

    // Step 2 — buyer approved; capture on the server, then save the order to our DB
    onApprove: async function (ppData) {
      const captureRes  = await fetch('backend/paypal.php?action=capture', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderID: ppData.orderID }),
      });
      const captured = await captureRes.json();

      if (captured.success) {
        await postOrder('', '', ppData.orderID);
      } else {
        alert('Payment could not be completed: ' + (captured.error || 'Unknown error'));
      }
    },

    onError: function (err) {
      console.error('PayPal SDK error:', err);
      alert('PayPal encountered an error. Please try again or choose card payment.');
    },

    // No action needed when buyer cancels — they stay on the checkout form
    onCancel: function () {}

  }).render('#paypal-buttons-container');

  _paypalButtonsRendered = true;
}

if (checkoutForm) {
  checkoutForm.addEventListener('submit', function (e) {
    e.preventDefault();

    // PayPal flow: the SDK button handles submission — the native submit does nothing
    const selected = checkoutForm.querySelector('input[name="payment_method"]:checked');
    if (selected && selected.value === 'paypal') return;

    const phone = checkoutForm.phone.value.trim();
    if (!isValidPhone(phone)) {
      alert('Please enter a valid phone number (e.g. 71 234 567, 03 123 456, or +961 71 234 567).');
      checkoutForm.phone.focus();
      return;
    }

    const geoOptions    = { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 };
    const runWithoutGeo = () => postOrder('', '');

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => postOrder(pos.coords.latitude, pos.coords.longitude),
        ()    => runWithoutGeo(),
        geoOptions
      );
    } else {
      runWithoutGeo();
    }
  });
}






   


document.addEventListener('click', function(e) {
  // Quantity +/-
  if (e.target.classList.contains('plus') || e.target.classList.contains('minus')) {
    const input = e.target.parentElement.querySelector('.quantity-input');
    let val = parseInt(input.value);
    if (e.target.classList.contains('plus')) input.value = val + 1;
    if (e.target.classList.contains('minus') && val > 1) input.value = val - 1;
  }
  // Add to Cart
  const addBtn = e.target.closest('.add-to-cart');
  if (addBtn) {
    console.log('Cart before:', cart);
    const card = addBtn.closest('.product-card');
    if (!card) return;
    const idAttr = card.querySelector('.usage-details-btn')?.getAttribute('data-id');
    const product = findProductById(idAttr);
    if (!product) {
      alert('Product not found!');
      return;
    }
    const name = product.name;
    const price = parseFloat(product.price);
    const img = product.image;
    const qty = parseInt(card.querySelector('.quantity-input').value);
    console.log('Quantity to add:', qty);
    const id = Number(idAttr);
    const existing = cart.find(item => Number(item.id) === id);
    if (existing) {
      existing.qty = qty;
    } else {
      cart.push({ id, name, price, img, qty });
    }
    console.log('Cart after:', cart);
    updateCartCount();
    showCartModal();
  }



  // Open Cart
  if (e.target.closest('.cart-icon')) {
    console.log('Delegated event: cart icon clicked');
    showCartModal();
  }
  // Close Cart
  if (e.target === closeCartBtn || e.target === cartModal) {
    cartModal.classList.remove('active');
  }
});






function updateCartCount() {
  let total = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCount.textContent = total;
}

function showCartModal() {
  if (!cartModal) return;
  cartModal.classList.add('active');
  renderCartItems();
}

function renderCartItems() {
  if (!cartItemsDiv || !cartTotalDiv) return;
  if (cart.length === 0) {
    cartItemsDiv.innerHTML = '<p>Your cart is empty.</p>';
    cartTotalDiv.textContent = '';
    return;
  }
  cartItemsDiv.innerHTML = cart.map(item => {
    const safeName  = escapeHtml(item.name);
    const safeImage = escapeHtml(item.img);
    const safeQty   = Number(item.qty);
    const safeTotal = (item.price * item.qty).toFixed(2);
    return `
      <div class="cart-item">
        <img src="${safeImage}" alt="${safeName}" style="width:40px;height:40px;border-radius:8px;vertical-align:middle;">
        ${safeName} x${safeQty} <span style="float:right;">$${safeTotal}</span>
      </div>`;
  }).join('');
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  cartTotalDiv.textContent = `Total: $${total.toFixed(2)}`;
}

function renderOrderSummary() {
  const summaryDiv = document.getElementById('order-summary');
  if (!summaryDiv) return;
  if (!cart || cart.length === 0) {
    summaryDiv.innerHTML = '<p>Your cart is empty.</p>';
    return;
  }
  const form = document.getElementById('checkoutForm');
  const shipMethod = (form && form.shipping_method && form.shipping_method.value) || 'standard';
  const subtotal = getCartSubtotal();
  const tax = computeCheckoutTax(subtotal);
  const shippingFee = computeShippingFee(shipMethod, subtotal);
  const grandTotal = Math.round((subtotal + tax + shippingFee) * 100) / 100;
  const lines = cart
    .map(
      (item) =>
        `<div>${escapeHtml(item.name)} ×${Number(item.qty)} — $${(item.price * item.qty).toFixed(2)}</div>`
    )
    .join('');
  summaryDiv.innerHTML =
    lines +
    `<div style="margin-top:1rem;border-top:1px solid rgba(76,29,149,0.2);padding-top:0.75rem;">
      <div>Subtotal: <strong>$${subtotal.toFixed(2)}</strong></div>
      <div>Tax (${(currentTaxRate * 100).toFixed(0)}%): <strong>$${tax.toFixed(2)}</strong></div>
      <div>Shipping (${shipMethod === 'express' ? 'Express' : 'Standard'}): <strong>$${shippingFee.toFixed(2)}</strong></div>
      <div style="margin-top:0.5rem;font-weight:bold;">Total: $${grandTotal.toFixed(2)}</div>
    </div>`;
}


// Smooth Scroll
const navLinks = document.querySelectorAll('.nav-links a');
navLinks.forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      window.scrollTo({
        top: target.offsetTop - 60,
        behavior: 'smooth'
      });
    }
  });
});

// Navbar Active Link on Scroll
window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('section');
  let scrollPos = window.scrollY + 80;
  sections.forEach(sec => {
    if (scrollPos >= sec.offsetTop && scrollPos < sec.offsetTop + sec.offsetHeight) {
      navLinks.forEach(link => link.classList.remove('active'));
      const activeLink = document.querySelector(`.nav-links a[href="#${sec.id}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  });
});

const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = contactForm.name.value.trim();
    const email = contactForm.email.value.trim();
    const message = contactForm.message.value.trim();

    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message) {
      alert('Please fill out all fields with valid information.');
      return;
    }

    // Send data to backend/messages.php
    const res = await fetch('backend/messages.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message })
    });
    const data = await res.json();
    if (data.success) {
      contactForm.querySelector('.thank-you-message').style.display = 'block';
      contactForm.reset();
      setTimeout(() => {
        contactForm.querySelector('.thank-you-message').style.display = 'none';
      }, 3000);
    } else {
      alert('Error sending message: ' + (data.error || 'Unknown error'));
    }
  });
}


// Animations on Scroll
const animatedEls = document.querySelectorAll('.product-card, .about-content, .contact-section');
function animateOnScroll() {
  animatedEls.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 60) {
      el.style.opacity = 1;
      el.style.transform = 'none';
    }
  });
}
window.addEventListener('scroll', animateOnScroll);
window.addEventListener('load', animateOnScroll); 




async function loadFeaturedProducts() {
  const grid = document.getElementById('featured-products-grid');
  grid.innerHTML = '';
  const res = await fetch('backend/products.php/featured');
  const data = await res.json();
  if (data.success && data.products.length) {
    products = data.products;
    const productsHTML = data.products.map(product => {
      const safeName  = escapeHtml(product.name);
      const safeDesc  = escapeHtml(product.description);
      const safeImage = escapeHtml(product.image);
      const safeId    = Number(product.id);
      return `
        <div class="product-card">
          <img src="${safeImage}" alt="${safeName}">
          <h3>${safeName}</h3>
          <p>${safeDesc}</p>
          <div class="price">$${parseFloat(product.price).toFixed(2)}</div>
          <div class="quantity-selector">
            <button type="button" class="quantity-btn" onclick="changeFeaturedQty(${safeId}, -1)">-</button>
            <input type="number" class="quantity-input" id="featured-qty-${safeId}" value="1" min="1" style="width:40px; text-align:center;">
            <button type="button" class="quantity-btn" onclick="changeFeaturedQty(${safeId}, 1)">+</button>
          </div>
          <button type="button" class="btn add-to-cart">Add to Cart</button>
          <button type="button" class="btn usage-details-btn" data-id="${safeId}">Usage &amp; Details</button>
        </div>`;
    }).join('');
    grid.innerHTML = productsHTML;
  } else {
    grid.innerHTML = '<div class="no-featured-message"><span>⭐ No featured products at this time.</span></div>';
  }
}
// Call on page load
window.addEventListener('DOMContentLoaded', () => {
  loadFeaturedProducts();
});

// Payment method toggle + shipping method updates order summary totals
document.addEventListener('DOMContentLoaded', function() {
  refreshTaxSettings();
  loadSiteConfig(); // pre-fetch public config (WhatsApp number, PayPal client-id)

  const placeOrderBtn = document.getElementById('place-order-btn');

  document.querySelectorAll('input[name="payment_method"]').forEach(el => {
    el.addEventListener('change', function() {
      const isCard   = this.value === 'card';
      const isPaypal = this.value === 'paypal';

      document.getElementById('card-info').style.display   = isCard   ? 'block' : 'none';
      document.getElementById('paypal-info').style.display = isPaypal ? 'block' : 'none';

      // Show native submit button only for card; PayPal SDK button handles paypal flow
      if (placeOrderBtn) placeOrderBtn.style.display = isCard ? '' : 'none';

      if (isPaypal) setupPaypalButtons();
    });
  });

  const shipSel = document.querySelector('#checkoutForm select[name="shipping_method"]');
  if (shipSel) {
    shipSel.addEventListener('change', async function() {
      await refreshTaxSettings();
      renderOrderSummary();
    });
  }
});




function changeFeaturedQty(id, delta) {
  const input = document.getElementById(`featured-qty-${id}`);
  let value = parseInt(input.value) || 1;
  value += delta;
  if (value < 1) value = 1;
  input.value = value;
}
window.changeFeaturedQty = changeFeaturedQty;




function getFeaturedQty(id) {
  const input = document.getElementById(`featured-qty-${id}`);
  return parseInt(input.value) || 1;
}
window.getFeaturedQty = getFeaturedQty;