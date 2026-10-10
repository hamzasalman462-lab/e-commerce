import { 
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, OAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
  collection, addDoc, getDocs, query, where, doc, 
  updateDoc, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const auth = window.auth;
const db = window.db;

let currentUser = null;
let currentRole = "buyer";
let cart = JSON.parse(localStorage.getItem("cart")) || [];
let isSignup = false;

/* ============ NAVIGATION ============ */
window.showPage = (page) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  if (page === "cart") renderCart();
  if (page === "orders") renderOrders();
  if (page === "sellerDash") renderMyProducts();
};

/* ============ AUTH ============ */
window.toggleAuthMode = () => {
  isSignup = !isSignup;
  document.getElementById("authTitle").textContent = isSignup ? "Sign Up" : "Login";
  document.getElementById("authBtn").textContent = isSignup ? "Create Account" : "Login";
  document.getElementById("toggleText").textContent = isSignup ? "Already have account?" : "Don't have account?";
};

window.handleAuth = async () => {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;
  const role = document.getElementById("authRole").value;

  if (!email || !password) return alert("Fill all fields!");

  try {
    if (isSignup) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Save role in Firestore
      await addDoc(collection(db, "users"), {
        uid: cred.user.uid, email, role, createdAt: serverTimestamp()
      });
      alert("Account created as " + role);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    showPage("home");
  } catch (e) { alert(e.message); }
};

window.loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await saveUserRoleIfNew(result.user);
    showPage("home");
  } catch (e) { alert(e.message); }
};

window.loginWithApple = async () => {
  try {
    const provider = new OAuthProvider("apple.com");
    const result = await signInWithPopup(auth, provider);
    await saveUserRoleIfNew(result.user);
    showPage("home");
  } catch (e) { alert(e.message); }
};

async function saveUserRoleIfNew(user) {
  const q = query(collection(db, "users"), where("uid", "==", user.uid));
  const snap = await getDocs(q);
  if (snap.empty) {
    await addDoc(collection(db, "users"), {
      uid: user.uid, email: user.email, role: "buyer", createdAt: serverTimestamp()
    });
  }
}

window.logout = async () => {
  await signOut(auth);
  showPage("home");
};

/* ============ AUTH STATE ============ */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const loginLink = document.getElementById("loginLink");
  const logoutLink = document.getElementById("logoutLink");
  const sellerLink = document.getElementById("sellerLink");
  const ordersLink = document.getElementById("ordersLink");

  if (user) {
    loginLink.style.display = "none";
    logoutLink.style.display = "inline";
    ordersLink.style.display = "inline";

    // Get role
    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      currentRole = snap.docs[0].data().role;
      if (currentRole === "seller") sellerLink.style.display = "inline";
    }
  } else {
    loginLink.style.display = "inline";
    logoutLink.style.display = "none";
    sellerLink.style.display = "none";
    ordersLink.style.display = "none";
  }
  renderProducts();
});

/* ============ PRODUCTS ============ */
window.addProduct = async () => {
  if (!currentUser) return alert("Login first!");
  if (currentRole !== "seller") return alert("Only sellers can upload!");

  const name = document.getElementById("pName").value;
  const price = parseFloat(document.getElementById("pPrice").value);
  const desc = document.getElementById("pDesc").value;
  const image = document.getElementById("pImage").value || "https://via.placeholder.com/300";

  if (!name || !price) return alert("Fill name & price!");

  await addDoc(collection(db, "products"), {
    name, price, desc, image,
    sellerId: currentUser.uid,
    sellerEmail: currentUser.email,
    createdAt: serverTimestamp()
  });

  document.getElementById("pName").value = "";
  document.getElementById("pPrice").value = "";
  document.getElementById("pDesc").value = "";
  document.getElementById("pImage").value = "";
  alert("Product uploaded!");
  renderMyProducts();
  renderProducts();
};

async function renderProducts() {
  const grid = document.getElementById("productGrid");
  const search = document.getElementById("searchBar")?.value.toLowerCase() || "";
  grid.innerHTML = "Loading...";

  const snap = await getDocs(collection(db, "products"));
  grid.innerHTML = "";
  snap.forEach(d => {
    const p = d.data();
    if (search && !p.name.toLowerCase().includes(search)) return;
    grid.innerHTML += `
      <div class="card">
        <img src="${p.image}" alt="${p.name}">
        <h4>${p.name}</h4>
        <p class="price">₹${p.price}</p>
        <button onclick="addToCart('${d.id}','${p.name}',${p.price},'${p.image}')">Add to Cart</button>
      </div>`;
  });
  if (grid.innerHTML === "") grid.innerHTML = "<p>No products found.</p>";
}

async function renderMyProducts() {
  if (!currentUser) return;
  const box = document.getElementById("myProducts");
  box.innerHTML = "";
  const q = query(collection(db, "products"), where("sellerId", "==", currentUser.uid));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const p = d.data();
    box.innerHTML += `
      <div class="card">
        <img src="${p.image}">
        <h4>${p.name}</h4>
        <p class="price">₹${p.price}</p>
        <button onclick="deleteProduct('${d.id}')">Delete</button>
      </div>`;
  });
}

window.deleteProduct = async (id) => {
  if (confirm("Delete this product?")) {
    await deleteDoc(doc(db, "products", id));
    renderMyProducts();
    renderProducts();
  }
};

/* ============ CART ============ */
window.addToCart = (id, name, price, image) => {
  const existing = cart.find(i => i.id === id);
  if (existing) existing.qty++;
  else cart.push({ id, name, price, image, qty: 1 });
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  alert("Added to cart!");
};

function updateCartCount() {
  document.getElementById("cartCount").textContent = 
    cart.reduce((s, i) => s + i.qty, 0);
}

function renderCart() {
  const box = document.getElementById("cartItems");
  box.innerHTML = "";
  let total = 0;
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    box.innerHTML += `
      <div class="cart-row">
        <div><b>${item.name}</b> × ${item.qty}</div>
        <div>₹${item.price * item.qty}</div>
        <button class="remove-btn" onclick="removeFromCart(${idx})">Remove</button>
      </div>`;
  });
  document.getElementById("cartTotal").textContent = "Total: ₹" + total;
}

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
  updateCartCount();
};

/* ============ ORDERS ============ */
window.placeOrder = async () => {
  if (!currentUser) return alert("Login first!");
  if (cart.length === 0) return alert("Cart is empty!");
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  await addDoc(collection(db, "orders"), {
    buyerId: currentUser.uid,
    buyerEmail: currentUser.email,
    items: cart,
    total,
    status: "Pending",
    createdAt: serverTimestamp()
  });

  cart = [];
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartCount();
  alert("Order placed successfully! 🎉");
  showPage("orders");
};

async function renderOrders() {
  if (!currentUser) return;
  const box = document.getElementById("ordersList");
  box.innerHTML = "Loading...";
  const q = query(collection(db, "orders"), where("buyerId", "==", currentUser.uid));
  const snap = await getDocs(q);
  box.innerHTML = "";
  if (snap.empty) { box.innerHTML = "<p>No orders yet.</p>"; return; }

  snap.forEach(d => {
    const o = d.data();
    const itemsList = o.items.map(i => `${i.name} × ${i.qty}`).join(", ");
    box.innerHTML += `
      <div class="order-card">
        <h4>Order #${d.id.slice(0,8)}</h4>
        <p><b>Items:</b> ${itemsList}</p>
        <p><b>Total:</b> ₹${o.total}</p>
        <p><b>Status:</b> <span class="status ${o.status}">${o.status}</span></p>
      </div>`;
  });
}

/* ============ INIT ============ */
updateCartCount();
renderProducts();