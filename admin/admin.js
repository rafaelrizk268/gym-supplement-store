
    // Smooth scroll for navbar links
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href.startsWith('#')) {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
          }
          // Optionally update active class
          document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
          this.classList.add('active');
        }
      });
    });
  
 




    // PRODUCT RELATED FUNCTIONS
   let allProducts = [];
   async function fetchProducts() {
  const res = await fetch('../backend/products.php');
  const data = await res.json();
  const tbody = document.querySelector('#productsTable tbody');
  tbody.innerHTML = '';
  if (data.success && data.products.length) {
    allProducts = data.products; // Ensure allProducts is always up to date
    data.products.forEach(product => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td>$${parseFloat(product.price).toFixed(2)}</td>
        <td><img src="../${product.image}" alt="${product.name}" style="width:40px;height:40px;object-fit:contain;"></td>
        <td>${product.description || ''}</td>
        <td><input type="checkbox" class="featured-checkbox" data-id="${product.id}" ${product.featured == 1 ? 'checked' : ''}></td>
        <td class="admin-actions">
          <button onclick="editProduct(${product.id})">Edit</button>
          <button onclick="deleteProduct(${product.id})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    // Add event listeners for featured checkboxes
    tbody.querySelectorAll('.featured-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', async function() {
        const id = this.getAttribute('data-id');
        const featured = this.checked ? 1 : 0;
        // Get the full product object from allProducts
        const product = allProducts.find(p => p.id == id);
        if (!product) return;
        const { name, price, image, description, usage } = product;
        const res = await fetch(`../backend/products.php/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, price, image, description, usage, featured })
        });
        const data = await res.json();
        if (!data.success) {
          alert('Error updating featured status: ' + (data.error || 'Unknown error'));
          // Optionally revert checkbox
          this.checked = !this.checked;
        }
      });
    });
  } else {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No products found.</td></tr>';
  }
}
    
    // Call fetchProducts on page load
    fetchProducts();
   
    document.getElementById('addProductForm').addEventListener('submit', async function(e) {
        console.log('Add product form submitted');
        e.preventDefault();
        
  const form = e.target;
  const name = form.name.value.trim();
  const price = form.price.value.trim();
  const image = form.image.value.trim();
  const description = form.description.value.trim();
  const usage = form.usage.value.trim();
  const featured = form.featured.checked ? 1 : 0;

  if (!name || !price || !image || !description) {
    alert('Please fill in all fields.');
    return;
  }

  const res = await fetch('../backend/products.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price, image, description, featured, usage })
  });
  const data = await res.json();
  if (data.success) {
    form.reset();
    fetchProducts(); // Refresh the table
  } else {
    alert('Error adding product: ' + (data.error || 'Unknown error'));
  }
});



async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const res = await fetch(`../backend/products.php/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
    fetchProducts();
    } else {
    alert('Error deleting product: ' + (data.error || 'Unknown error'));
    }
    }
                
    function editProduct(id) {
    // Find the product in the current table
    fetch('../backend/products.php')
    .then(res => res.json())
    .then(data => {
    const product = data.products.find(p => p.id == id);
    if (!product) return;
    const modal = document.getElementById('editProductModal');
    const form = document.getElementById('editProductForm');
    form.id.value = product.id;
    form.name.value = product.name;
    form.price.value = product.price;
    form.image.value = product.image;
    form.description.value = product.description;
    form.usage.value = product.usage || '';
    // Prevent page scroll when scrolling inside the textarea
    form.usage.addEventListener('wheel', function(e) {
      const atTop = this.scrollTop === 0;
      const atBottom = this.scrollHeight - this.scrollTop === this.clientHeight;
      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        e.preventDefault();
      }
    }, { passive: false });
    modal.style.display = 'flex';
    });
    }
                    
    // Close modal
    document.getElementById('closeEditModal').onclick = function() {
    document.getElementById('editProductModal').style.display = 'none';
    };



// Handle form submit
document.getElementById('editProductForm').addEventListener('submit', async function(e) {
e.preventDefault();
const form = e.target;
const id = form.id.value;
const name = form.name.value.trim();
const price = form.price.value.trim();
const image = form.image.value.trim();
const description = form.description.value.trim();
const usage = form.usage ? form.usage.value.trim() : '';

const res = await fetch(`../backend/products.php/${id}`, {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id, name, price, image, description, usage })
});
const data = await res.json();
if (data.success) {
document.getElementById('editProductModal').style.display = 'none';
fetchProducts();
} else {
alert('Error updating product: ' + (data.error || 'Unknown error'));
}
});
                
// Optional: Close modal when clicking outside the form
document.getElementById('editProductModal').addEventListener('click', function(e) {
if (e.target === this) this.style.display = 'none';
});






 // MESSAGES RELATED FUNCTIONS

async function fetchMessages() {
const res = await fetch('../backend/messages.php');
const data = await res.json();
const tbody = document.querySelector('#messagesTable tbody');
tbody.innerHTML = '';
if (data.success && data.messages.length) {
data.messages.forEach(msg => {
const tr = document.createElement('tr');
tr.innerHTML = `
<td>${msg.id}</td>
<td>${msg.name}</td>
<td>${msg.email}</td>
<td>${msg.message}</td>
<td class="admin-actions">
<button onclick="deleteMessage(${msg.id})">Delete</button>
</td>
`;
tbody.appendChild(tr);
});
} else {
tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No messages found.</td></tr>';
}
}

// Call fetchMessages on page load
fetchMessages();

async function deleteMessage(id) {
if (!confirm('Are you sure you want to delete this message?')) return;
const res = await fetch('../backend/messages.php', {
method: 'DELETE',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id })
});
const data = await res.json();
if (data.success) {
fetchMessages();
} else {
alert('Error deleting message: ' + (data.error || 'Unknown error'));
}
}
fetchMessages()
document.querySelector('a[href="#messages"]').addEventListener('click', fetchMessages);
                       





 // ORDERS RELATED FUNCTIONS
 
  async function fetchOrders() {
  const res = await fetch('../backend/orders.php');
  const data = await res.json();
  const tbody = document.querySelector('#ordersTable tbody');
  tbody.innerHTML = '';
  if (data.success && data.orders.length) {
  data.orders.forEach(order => {
  const tr = document.createElement('tr');
   tr.innerHTML = `
  <td>${order.id}</td>
  <td>${order.customer_name}</td>
  <td>${order.customer_email}</td>
  <td>${order.phone != null && order.phone !== '' ? order.phone : '—'}</td>
  <td>
    ${order.street_address}, ${order.city}, ${order.state}, ${order.zip}, ${order.country}
  </td>
  <td>${order.shipping_method}</td>
  <td>${order.payment_method}</td>
  <td>${order.cardholder_name || ''}</td>
  <td>$${order.tax != null ? parseFloat(order.tax).toFixed(2) : '0.00'}</td>
  <td>$${order.shipping_fee != null ? parseFloat(order.shipping_fee).toFixed(2) : '0.00'}</td>
  <td style="max-width:120px;word-break:break-word;">${order.tracking_number != null && order.tracking_number !== '' ? order.tracking_number : '—'}</td>
  <td>$${parseFloat(order.total).toFixed(2)}</td>
  <td>${order.status || ''}</td>
  <td style="white-space:nowrap;">${order.created_at ? `${order.created_at.split(' ')[0]}<br>${order.created_at.split(' ')[1]}` : ''}</td>
  <td class="admin-actions">
    <button onclick="viewOrderItems(${order.id})">View Items</button>
    <button onclick="deleteOrder(${order.id})">Delete</button>
  </td>
`;
 tbody.appendChild(tr);
});
} else {
tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;">No orders found.</td></tr>';
}
}
                            
// Call fetchOrders on page load
fetchOrders();
document.querySelector('a[href="#orders"]').addEventListener('click', fetchOrders);







async function deleteOrder(id) {
if (!confirm('Are you sure you want to delete this order?')) return;
const res = await fetch('../backend/orders.php', {
method: 'DELETE',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ id })
});
const data = await res.json();
if (data.success) {
fetchOrders();
} else {
alert('Error deleting order: ' + (data.error || 'Unknown error'));
}
}



async function viewOrderItems(orderId) {
    // Remove any existing items row
    const existing = document.getElementById('items-row-' + orderId);
    if (existing) {
      existing.remove();
      return;
    }
    // Fetch order items from backend
    const res = await fetch(`../backend/orders.php?order_id=${orderId}`);
    const data = await res.json();
    let itemsHtml = '';
    if (data.success && data.items && data.items.length) {
      itemsHtml = '<ul>' + data.items.map(item =>
        `<li>${item.product_name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}</li>`
      ).join('') + '</ul>';
    } else {
      itemsHtml = '<em>No items found for this order.</em>';
    }
    // Insert a new row after the order row
    const orderRow = Array.from(document.querySelectorAll('#ordersTable tbody tr')).find(tr =>
      tr.firstElementChild && tr.firstElementChild.textContent == orderId.toString()
    );
    if (orderRow) {
      const itemsRow = document.createElement('tr');
      itemsRow.id = 'items-row-' + orderId;
      itemsRow.innerHTML = `<td colspan="15">${itemsHtml}</td>`;
      orderRow.parentNode.insertBefore(itemsRow, orderRow.nextSibling);
    }
  }

(function initVatAdminToggle() {
  const toggle = document.getElementById('vatToggle');
  if (!toggle) return;

  /** Synced with DB after load / successful PUT (for debugging or future use) */
  let is_tax_enabled = true;

  /** Bumps when user toggles so a slow initial GET cannot overwrite the UI */
  let vatSettingsLoadGen = 0;

  function setToggleVisual(on) {
    is_tax_enabled = !!on;
    toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    toggle.classList.toggle('vat-switch--on', on);
  }

  async function loadVatSettings() {
    const myGen = ++vatSettingsLoadGen;
    try {
      const res = await fetch('../backend/settings.php', { credentials: 'same-origin' });
      const data = await res.json();
      if (myGen !== vatSettingsLoadGen) return;
      if (data.success) {
        setToggleVisual(!!data.vat_enabled);
      }
    } catch (e) {
      if (myGen !== vatSettingsLoadGen) return;
      console.warn('VAT load failed', e);
    }
  }

  toggle.addEventListener('click', async function onVatToggleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const previousOn = toggle.getAttribute('aria-checked') === 'true';
    const newVal = !previousOn;

    vatSettingsLoadGen++;
    setToggleVisual(newVal);
    const newStatus = newVal ? 'ON' : 'OFF';
    console.log('Tax Status Changed:', newStatus);

    try {
      const res = await fetch('../backend/settings.php', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ vat_enabled: newVal }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setToggleVisual(!!data.vat_enabled);
        const savedStatus = data.vat_enabled ? 'ON' : 'OFF';
        console.log('Tax Status Changed:', savedStatus, '(saved to database)');
      } else {
        setToggleVisual(previousOn);
        console.log('Tax Status Changed:', previousOn ? 'ON' : 'OFF', '(reverted — server error)');
        alert(data.error || 'Could not update VAT setting');
      }
    } catch (err) {
      setToggleVisual(previousOn);
      console.log('Tax Status Changed:', previousOn ? 'ON' : 'OFF', '(reverted — network)');
      console.error(err);
      alert('Network error updating VAT');
    }
  });

  loadVatSettings();
})();



  