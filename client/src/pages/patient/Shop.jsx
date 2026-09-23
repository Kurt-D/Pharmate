import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import PrescriptionShop, { ADDRESS_OPTIONS } from './PrescriptionShop.jsx';

const FALLBACK_PRODUCTS = [
  {
    id: 'biogesic',
    brand: 'Biogesic',
    generic: 'Paracetamol',
    strength: '500 mg',
    category: 'Pain Relief',
    maker: 'Unilab',
    ingredient: 'Paracetamol 500 mg',
    strip: 48,
    box: 216,
    limit: 4,
    pack: '10 tablets / blister strip',
    guide: 'Take one tablet every 4–6 hours when needed.',
    timing: 'May be taken with or without food.',
    warning: 'Do not take more than 8 tablets in 24 hours.',
  },
  {
    id: 'advil',
    brand: 'Advil',
    generic: 'Ibuprofen',
    strength: '200 mg',
    category: 'Pain Relief',
    maker: 'Haleon',
    ingredient: 'Ibuprofen 200 mg',
    strip: 72,
    box: 315,
    limit: 2,
    pack: '10 tablets / blister strip',
    guide: 'Take one tablet every 4–6 hours when needed.',
    timing: 'Take after meals with a full glass of water.',
    warning: 'Do not take more than 6 tablets in 24 hours.',
  },
  {
    id: 'neozep',
    brand: 'Neozep Forte',
    generic: 'Phenylephrine + Chlorphenamine + Paracetamol',
    strength: '10 mg / 2 mg / 500 mg',
    category: 'Cold & Flu',
    maker: 'Unilab',
    ingredient: 'Phenylephrine, chlorphenamine and paracetamol',
    strip: 55,
    box: 248,
    limit: 2,
    pack: '10 tablets / blister strip',
    guide: 'Take one tablet every 6 hours for cold symptoms.',
    timing: 'Take after meals. May cause drowsiness.',
    warning: 'Do not combine with another product containing paracetamol.',
  },
  {
    id: 'cetirizine',
    brand: 'Allerkast',
    generic: 'Cetirizine',
    strength: '10 mg',
    category: 'Cold & Flu',
    maker: 'RiteMed',
    ingredient: 'Cetirizine hydrochloride 10 mg',
    strip: 65,
    box: 290,
    limit: 3,
    pack: '10 tablets / blister strip',
    guide: 'Take one tablet once daily when needed.',
    timing: 'Take at the same time each day.',
    warning: 'May cause drowsiness. Avoid driving if affected.',
  },
  {
    id: 'ascorbic',
    brand: 'Poten-Cee',
    generic: 'Ascorbic Acid',
    strength: '500 mg',
    category: 'Vitamins',
    maker: 'PascualLab',
    ingredient: 'Ascorbic acid 500 mg',
    strip: 85,
    box: 380,
    limit: 5,
    pack: '10 capsules / blister strip',
    guide: 'Take one capsule once daily.',
    timing: 'Take after a meal.',
    warning: 'Follow the label or your healthcare professional’s advice.',
  },
  {
    id: 'multivitamins',
    brand: 'Enervon',
    generic: 'Multivitamins',
    strength: 'Adult formula',
    category: 'Vitamins',
    maker: 'Unilab',
    ingredient: 'Vitamin B complex and vitamin C',
    strip: 95,
    box: 425,
    limit: 3,
    pack: '10 tablets / blister strip',
    guide: 'Take one tablet once daily.',
    timing: 'Take after breakfast.',
    warning: 'Do not exceed the recommended daily dose.',
  },
  {
    id: 'ors',
    brand: 'Hydrite',
    generic: 'Oral Rehydration Salts',
    strength: '20.5 g',
    category: 'First Aid',
    maker: 'AmEuroPharma',
    ingredient: 'Glucose and electrolyte salts',
    strip: 28,
    box: 250,
    limit: 10,
    pack: '1 sachet',
    guide: 'Dissolve one sachet in the amount of clean water stated on the label.',
    timing: 'Sip frequently after each loose stool.',
    warning: 'Discard mixed solution after 24 hours.',
  },
  {
    id: 'betadine',
    brand: 'Betadine',
    generic: 'Povidone-Iodine',
    strength: '10%',
    category: 'First Aid',
    maker: 'Mundipharma',
    ingredient: 'Povidone-iodine 10% solution',
    strip: 96,
    box: 178,
    limit: 3,
    pack: '15 mL bottle',
    guide: 'Apply a small amount to the cleaned affected area.',
    timing: 'For external use only.',
    warning: 'Do not swallow or use on large wounds without medical advice.',
  },
];

function Icon({ name, size = 22 }) {
  const paths = {
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2 12h10l2-8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="17" cy="20" r="1" />
      </>
    ),
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    delivery: (
      <>
        <path d="M3 6h11v11H3Z" />
        <path d="M14 10h4l3 3v4h-7Z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
        <path d="M8 20v-6h8v6" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
        <path d="M15 12h5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
    >
      {paths[name]}
    </svg>
  );
}
const money = (value) => `₱${Number(value).toFixed(2)}`;
const SHOP_DRAFT_KEY = 'pm_patient_shop_draft';

function readShopDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(SHOP_DRAFT_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function formalMedicineName(value) {
  return String(value || '')
    .trim()
    .split(/(\s+|[-/])/)
    .map((part) =>
      /^(\s+|[-/])$/.test(part) || /^[A-Z0-9]{2,}$/.test(part)
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
    )
    .join('');
}

function mockPrice(seed) {
  const value = [...String(seed || 'medicine')].reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  return 45 + (value % 9) * 12;
}

function catalogBrands(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function catalogProduct(drug) {
  const rawGeneric = String(drug.generic_name || '').trim();
  const fallback = FALLBACK_PRODUCTS.find(
    (product) => product.generic.toLowerCase() === rawGeneric.toLowerCase()
  );
  const brands = catalogBrands(drug.brand_names_json);
  const category = drug.therapeutic_category || drug.category || fallback?.category || 'OTC Medicine';
  const generic = formalMedicineName(rawGeneric);
  const strip = fallback?.strip ?? mockPrice(rawGeneric);
  return {
    id: `catalog-${drug.id}`,
    drugId: drug.id,
    brand: formalMedicineName(brands[0] || fallback?.brand || generic),
    generic,
    strength: drug.common_strength || fallback?.strength || '',
    category,
    maker: fallback?.maker || 'PharMate medicine catalog',
    ingredient: generic,
    // Demo-only pricing until a partner pharmacy supplies a live price list.
    strip,
    box: fallback?.box ?? Math.round(strip * 4.5),
    limit: fallback?.limit ?? 5,
    pack: fallback?.pack || `${drug.dosage_form || 'medicine'} pack`,
    guide: drug.administration_instruction || fallback?.guide || 'Follow the product label.',
    timing: drug.meal_instruction || fallback?.timing || 'Follow the product label.',
    warning: drug.guidance_dont || fallback?.warning || 'Use only as directed on the product label.',
    inStock: Boolean(drug.availability) && Number(drug.stock_quantity) > 0,
  };
}

export default function Shop() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [initialDraft] = useState(readShopDraft);
  const [mode, setMode] = useState(() =>
    searchParams.get('mode') === 'rx' ? 'rx' : initialDraft.mode === 'rx' ? 'rx' : 'otc'
  );
  const [modeTransition, setModeTransition] = useState('');
  const [search, setSearch] = useState(initialDraft.search || '');
  const [category, setCategory] = useState(initialDraft.category || 'All');
  const [cart, setCart] = useState(initialDraft.cart || {});
  const [detail, setDetail] = useState(null);
  const [detailPack, setDetailPack] = useState(initialDraft.detailPack || 'strip');
  const [detailQuantity, setDetailQuantity] = useState(initialDraft.detailQuantity || 1);
  const [checkout, setCheckout] = useState(
    () => location.pathname === '/patient/orders/checkout' || Boolean(initialDraft.checkout)
  );
  const [step, setStep] = useState([0, 1, 2].includes(initialDraft.step) ? initialDraft.step : 0);
  const [profile, setProfile] = useState({ address: '', contact_num: '' });
  const [branches, setBranches] = useState([]);
  const [fulfillment, setFulfillment] = useState(initialDraft.fulfillment || 'delivery');
  const [address, setAddress] = useState(initialDraft.address || '');
  const [contact, setContact] = useState(initialDraft.contact || '');
  const [recipientName, setRecipientName] = useState(initialDraft.recipientName || '');
  const [region, setRegion] = useState(initialDraft.region || '');
  const [province, setProvince] = useState(initialDraft.province || '');
  const [city, setCity] = useState(initialDraft.city || '');
  const [barangay, setBarangay] = useState(initialDraft.barangay || '');
  const [postalCode, setPostalCode] = useState(initialDraft.postalCode || '');
  const [streetName, setStreetName] = useState(initialDraft.streetName || '');
  const [building, setBuilding] = useState(initialDraft.building || '');
  const [houseNumber, setHouseNumber] = useState(initialDraft.houseNumber || '');
  const [branchId, setBranchId] = useState(initialDraft.branchId || '');
  // PharMate accepts cash only: cash on delivery or cash at branch pickup.
  const payment = fulfillment === 'delivery' ? 'cash_on_delivery' : 'cash_on_pickup';
  const discount = false;
  const discountId = '';
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [restockAlerts, setRestockAlerts] = useState(() => new Set());
  const [voiceSearchListening, setVoiceSearchListening] = useState(false);
  const [voiceSearchMessage, setVoiceSearchMessage] = useState('');
  const [cartMessage, setCartMessage] = useState('');
  const [lastAddedProduct, setLastAddedProduct] = useState(null);
  const voiceRecognition = useRef(null);
  const modeTimer = useRef(null);
  const cartMessageTimer = useRef(null);
  useEffect(() => {
    Promise.all([
      api('/api/patient/profile')
        .then((r) => r.data)
        .catch(() => ({})),
      api('/api/directory/branches')
        .then((r) => r.data)
        .catch(() => []),
      api('/api/patient/shop/otc')
        .then((r) => (Array.isArray(r.data) ? r.data : []))
        .catch(() => null),
    ]).then(([patient, branchList, otcCatalog]) => {
      setProfile(patient);
      setAddress((current) => current || patient.address || '');
      setContact((current) => current || patient.contact_num || '');
      setBranches(branchList);
      setBranchId((current) => current || branchList[0]?.id || '');
      setCatalog(otcCatalog);
    });
  }, []);
  useEffect(() => {
    if (searchParams.get('checkout') !== '1') return;
    setStep(1);
    setCheckout(true);
    navigate('/patient/orders/checkout', { replace: true });
  }, [navigate, searchParams]);
  useEffect(() => {
    if (location.pathname !== '/patient/orders/checkout') setCheckout(false);
  }, [location.pathname]);
  useEffect(
    () => () => {
      voiceRecognition.current?.abort?.();
    },
    []
  );
  useEffect(() => () => {
    clearTimeout(modeTimer.current);
    clearTimeout(cartMessageTimer.current);
  }, []);

  function startVoiceSearch() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceSearchMessage('Voice search is not available in this browser.');
      return;
    }
    voiceRecognition.current?.abort?.();
    const recognition = new Recognition();
    let speechLanguage = 'en-PH';
    try {
      speechLanguage =
        JSON.parse(localStorage.getItem('pm_senior_accessibility') || '{}').speechLanguage === 'fil'
          ? 'fil-PH'
          : 'en-PH';
    } catch {
      /* English Philippines remains a useful fallback. */
    }
    recognition.lang = speechLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setVoiceSearchListening(true);
      setVoiceSearchMessage('Listening… say the medicine name.');
    };
    recognition.onresult = (event) => {
      const medicineName = event.results?.[0]?.[0]?.transcript?.trim();
      if (!medicineName) return;
      setSearch(medicineName);
      setVoiceSearchMessage(`Searching for “${medicineName}”.`);
    };
    recognition.onerror = () => {
      setVoiceSearchMessage('I could not hear that. Please try again or type the medicine name.');
    };
    recognition.onend = () => setVoiceSearchListening(false);
    voiceRecognition.current = recognition;
    recognition.start();
  }
  useEffect(() => {
    try {
      sessionStorage.setItem(
        SHOP_DRAFT_KEY,
        JSON.stringify({
          mode,
          search,
          category,
          cart,
          detailPack,
          detailQuantity,
          checkout,
          step,
          fulfillment,
          address,
          contact,
          branchId,
          payment,
          discount,
          discountId,
        })
      );
    } catch {
      /* The shop remains usable when browser storage is unavailable. */
    }
  }, [
    address,
    branchId,
    cart,
    category,
    checkout,
    contact,
    detailPack,
    detailQuantity,
    discount,
    discountId,
    fulfillment,
    mode,
    payment,
    search,
    step,
  ]);
  const products = useMemo(() => {
    if (!catalog) return [];
    return catalog.map(catalogProduct);
  }, [catalog]);
  const categories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category).filter(Boolean))],
    [products]
  );
  useEffect(() => {
    if (category !== 'All' && !categories.includes(category)) setCategory('All');
  }, [categories, category]);
  const shown = useMemo(
    () =>
      products.filter((product) => {
        const query = search.trim().toLowerCase();
        return (
          (category === 'All' || product.category === category) &&
          (!query ||
            `${product.brand} ${product.generic} ${product.ingredient}`
              .toLowerCase()
              .includes(query))
        );
      }),
    [category, products, search]
  );
  const cartItems = Object.values(cart).filter((item) => item.quantity > 0);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product[item.pack] * item.quantity,
    0
  );
  const deliveryFee = fulfillment === 'delivery' ? 60 : 0;
  const discountAmount = discount ? subtotal * 0.2 : 0;
  const total = subtotal - discountAmount + deliveryFee;
  function setQuantity(product, quantity, pack = cart[product.id]?.pack || 'strip') {
    const safeQuantity = Math.max(0, Math.min(product.limit, quantity));
    setCart((current) => ({ ...current, [product.id]: { product, pack, quantity: safeQuantity } }));
    if (safeQuantity > (cart[product.id]?.quantity || 0)) {
      setLastAddedProduct(product);
      setCartMessage(`${product.brand} added to cart`);
      clearTimeout(cartMessageTimer.current);
      cartMessageTimer.current = window.setTimeout(() => setCartMessage(''), 2200);
    }
  }
  function openDetails(product) {
    setDetail(product);
    setDetailPack(cart[product.id]?.pack || 'strip');
    setDetailQuantity(Math.max(1, cart[product.id]?.quantity || 1));
  }
  function switchMode(nextMode) {
    if (nextMode === mode || modeTransition) return;
    setModeTransition(`leaving-${nextMode}`);
    modeTimer.current = window.setTimeout(() => {
      setMode(nextMode);
      setModeTransition(`entering-${nextMode}`);
      modeTimer.current = window.setTimeout(() => setModeTransition(''), 260);
    }, 180);
  }
  async function requestRestockAlert(product) {
    try {
      const drugId = String(product.id || '').replace(/^catalog-/, '');
      await api(`/api/patient/shop/otc/${drugId}/restock-alert`, { method: 'POST' });
      setRestockAlerts((current) => new Set([...current, product.id]));
    } catch {
      setError('We could not save your restock reminder. Please try again.');
    }
  }
  function startCheckout() {
    setError('');
    navigate('/patient/cart');
  }
  function continueCheckout() {
    const deliveryRegion = region;
    const deliveryProvince = province;
    const deliveryCity = city;
    const deliveryBarangay = barangay;
    if (!recipientName.trim()) return setError('Enter the full name for this order.');
    if (fulfillment === 'delivery' && (!deliveryRegion.trim() || !deliveryProvince.trim() || !deliveryCity.trim() || !deliveryBarangay.trim() || !postalCode.trim() || !streetName.trim()))
      return setError('Complete the recipient and delivery address fields.');
    if (!contact.trim()) return setError('Enter a contact number for order updates.');
    if (fulfillment === 'pickup' && !branchId) return setError('Choose a pickup branch.');
    setError('');
    setStep(2);
  }
  async function placeOrder() {
    if (discount && !discountId.trim())
      return setError('Enter the Senior Citizen or PWD ID number.');
    if (cartItems.length !== 1) {
      return setError('Please place one medicine at a time so stock can be confirmed safely.');
    }
    setPlacing(true);
    setError('');
    try {
      const deliveryAddress = fulfillment === 'delivery'
        ? [`House/Unit ${houseNumber.trim()}${building.trim() ? `, ${building.trim()}` : ''}`, streetName.trim(), barangay, city, province, region, postalCode.trim()].join(', ')
        : null;
      const orders = await Promise.all(cartItems.map(({ product, quantity }) => {
        if (!product.drugId) throw new Error('This medicine is not available from the live pharmacy catalog.');
        return api('/api/patient/orders', {
          method: 'POST',
          body: {
            drug_id: product.drugId,
            quantity,
            branch_id: branchId,
            fulfillment,
            address: deliveryAddress,
            payment_method: fulfillment === 'delivery' ? 'COD' : 'CASH_ON_PICKUP',
          },
        });
      }));
      sessionStorage.removeItem(SHOP_DRAFT_KEY);
      setCart({});
      setCheckout(false);
      navigate(`/patient/orders?placed=${encodeURIComponent(orders[0]?.data?.id || '')}`);
    } catch (requestError) {
      setError(requestError.message || 'The order could not be placed. Please try again.');
      setPlacing(false);
    }
  }

  if (location.pathname === '/patient/cart') {
    if (searchParams.get('type') === 'rx') return <PrescriptionShop checkoutPage />;
    return (
      <main className="pm-shop-page pm-cart-page">
        <header className="pm-cart-page__header">
          <button className="pm-cart-page__back" aria-label="Back to Pharmacy Shop" onClick={() => navigate('/patient/shop', { replace: true })} type="button"><Icon name="back" /></button>
          <div><small>Your cart</small><h1>Your Cart</h1></div>
        </header>
        <div className="pm-cart-type-tabs" role="tablist">
          <button className="active" role="tab" aria-selected="true" type="button">OTC Medicines</button>
          <button role="tab" aria-selected="false" onClick={() => navigate('/patient/cart?type=rx')} type="button">Prescription Medicines</button>
        </div>
        {cartItems.length ? (
          <section className="pm-cart-page__content">
            <div className="pm-cart-review__items">
              {cartItems.map(({ product, pack, quantity }) => (
                <article key={product.id}>
                  <span className="pm-cart-review__visual"><Icon name="medicine" size={27} /></span>
                  <div>
                    <strong>{product.brand}</strong>
                    <small>{pack === 'box' ? 'Full box' : product.pack}</small>
                    <b>{money(product[pack] * quantity)}</b>
                  </div>
                  <div className="pm-cart-review__quantity">
                    <button aria-label={`Remove one ${product.brand}`} onClick={() => setQuantity(product, quantity - 1, pack)} type="button"><Icon name="minus" size={16} /></button>
                    <strong>{quantity}</strong>
                    <button aria-label={`Add one ${product.brand}`} disabled={quantity >= product.limit} onClick={() => setQuantity(product, quantity + 1, pack)} type="button"><Icon name="plus" size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
            <div className="pm-cart-review__totals">
              <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              <div><span>Delivery fee</span><strong>Calculated at checkout</strong></div>
              <div className="total"><span>Total</span><strong>{money(subtotal)}</strong></div>
            </div>
            <button className="pm-checkout-primary" onClick={() => navigate('/patient/orders/checkout')} type="button">Proceed to Checkout</button>
          </section>
        ) : (
          <section className="pm-cart-page__empty">
            <span><Icon name="cart" size={25} /></span>
            <strong>Your cart is empty</strong>
            <p>Add medicines from the Pharmacy Shop to see them here.</p>
            <button onClick={() => navigate('/patient/shop')} type="button">Browse medicines</button>
          </section>
        )}
      </main>
    );
  }

  if (mode === 'rx')
    return (
      <main className={`pm-shop-page ${modeTransition}`}>
        <header className="pm-shop-header">
          <div>
            <h1>Pharmacy Shop</h1>
            <p>Upload a prescription for pharmacist approval.</p>
          </div>
          <button
            aria-label={`Open cart with ${itemCount} items`}
            onClick={() => navigate('/patient/cart?type=rx')}
            type="button"
          >
            <Icon name="cart" />
            {itemCount > 0 && <b>{itemCount}</b>}
          </button>
        </header>
        <div className="pm-shop-mode-tabs" role="tablist">
          <button onClick={() => switchMode('otc')} role="tab" aria-selected="false" type="button">
            <strong>OTC &amp; Vitamins</strong>
            <small>No prescription needed</small>
          </button>
          <button className="active" role="tab" aria-selected="true" type="button">
            <strong>Prescription (Rx) Meds</strong>
            <small>Requires upload and approval</small>
          </button>
        </div>
        <button
          className="pm-shop-track-button"
          onClick={() => navigate('/patient/orders')}
          type="button"
        >
          <Icon name="delivery" />
          Track Orders
        </button>
        <PrescriptionShop />
      </main>
    );

  return (
    <main className={`pm-shop-page ${modeTransition}`}>
      <header className="pm-shop-header">
        <div>
          <h1>Pharmacy Shop</h1>
          <p>OTC and pharmacist-gated prescription orders.</p>
        </div>
        <button
          aria-label={`Open cart with ${itemCount} items`}
          onClick={startCheckout}
          type="button"
        >
          <Icon name="cart" />
          {itemCount > 0 && <b>{itemCount}</b>}
        </button>
      </header>
      <div className="pm-shop-mode-tabs" role="tablist">
        <button className="active" role="tab" aria-selected="true" type="button">
          <strong>OTC &amp; Vitamins</strong>
          <small>No prescription needed</small>
        </button>
        <button onClick={() => switchMode('rx')} role="tab" aria-selected="false" type="button">
          <strong>Prescription (Rx) Meds</strong>
          <small>Requires upload and approval</small>
        </button>
      </div>
      <button
        className="pm-shop-track-button"
        onClick={() => navigate('/patient/orders')}
        type="button"
      >
        <Icon name="delivery" />
        Track Orders
      </button>
      <div className="pm-shop-search">
        <Icon name="search" />
        <input
          aria-label="Search brand or generic medicine"
          list="otc-medicine-list"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search brand or generic medicine"
        />
        <button
          aria-label={voiceSearchListening ? 'Listening for a medicine name' : 'Search by voice'}
          className={`pm-shop-voice-search${voiceSearchListening ? ' is-listening' : ''}`}
          onClick={startVoiceSearch}
          title="Search by voice"
          type="button"
        >
          <Icon name="mic" size={21} />
          <span className="visually-hidden">
            {voiceSearchListening ? 'Listening for medicine name' : 'Search by voice'}
          </span>
        </button>
        <datalist id="otc-medicine-list">
          {products.map((product) => (
            <option value={`${product.brand} / ${product.generic}`} key={product.id} />
          ))}
        </datalist>
      </div>
      {voiceSearchMessage && <p className="pm-shop-voice-search-message" role="status">{voiceSearchMessage}</p>}
      {cartMessage && <p className="pm-shop-cart-message" role="status">{cartMessage}</p>}
      <div className="pm-shop-filters" aria-label="Medicine categories">
        {categories.map((item) => (
          <button
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
            type="button"
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="pm-shop-heading">
        <div>
          <h2>{category === 'All' ? 'Browse OTC Medicines' : category}</h2>
          <p>{shown.length} products available</p>
        </div>
      </div>
      {shown.length ? (
        <section className="pm-product-grid">
          {shown.map((product) => {
            const quantity = cart[product.id]?.quantity || 0;
            return (
              <article key={product.id}>
                <button
                  className="pm-product-visual"
                  onClick={() => openDetails(product)}
                  aria-label={`View ${product.brand} details`}
                  type="button"
                >
                  <span>
                    <Icon name="medicine" size={34} />
                  </span>
                  <small>{product.pack}</small>
                </button>
                <div className="pm-product-copy">
                  <em className={product.inStock ? '' : 'pm-product-stock--out'}>
                    {product.inStock ? `OTC · Max ${product.limit}` : 'Out of stock'}
                  </em>
                  <h3>{product.brand}</h3>
                  <p>
                    {product.generic} {product.strength}
                  </p>
                  <strong>
                    {product.strip == null ? 'Price not set' : <>{money(product.strip)} <small>/ pack</small></>}
                  </strong>
                </div>
                {quantity ? (
                  <div className="pm-product-quantity">
                    <button
                      aria-label={`Remove one ${product.brand}`}
                      onClick={() => setQuantity(product, quantity - 1)}
                      type="button"
                    >
                      <Icon name="minus" size={18} />
                    </button>
                    <b>{quantity}</b>
                    <button
                      aria-label={`Add one ${product.brand}`}
                      onClick={() => setQuantity(product, quantity + 1)}
                      disabled={quantity >= product.limit}
                      type="button"
                    >
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="pm-product-add"
                    onClick={() => (product.inStock ? setQuantity(product, 1) : requestRestockAlert(product))}
                    disabled={(product.inStock && product.strip == null) || (!product.inStock && restockAlerts.has(product.id))}
                    type="button"
                  >
                    {product.inStock ? <Icon name="plus" size={18} /> : <Icon name="bell" size={18} />}{' '}
                    {!product.inStock
                      ? restockAlerts.has(product.id) ? 'Reminder set' : 'Notify me'
                      : product.strip == null ? 'Price unavailable' : 'Add'}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="pm-shop-empty">
          <Icon name="search" size={30} />
          <strong>No matching medicine</strong>
          <p>Try another brand, generic name, or category.</p>
        </div>
      )}
      {itemCount > 0 && createPortal(
        <footer
          className="pm-shop-cart-bar"
          onClick={startCheckout}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') startCheckout();
          }}
          role="button"
          tabIndex={0}
        >
          <span className="pm-shop-cart-bar__item">
            <span className="pm-shop-cart-bar__icon"><Icon name="cart" size={20} /></span>
            <span>
              <small>{itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart</small>
              <strong>{lastAddedProduct?.brand || 'Your medicine cart'}</strong>
            </span>
          </span>
          <button onClick={startCheckout} type="button">
            Checkout <strong>{money(total)}</strong>
          </button>
        </footer>
      , document.body)}
      {detail && createPortal(
        <div className="pm-drawer-backdrop" role="presentation">
          <section
            className="pm-product-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-title"
          >
            <header>
              <button
                onClick={() => setDetail(null)}
                aria-label="Close product details"
                type="button"
              >
                <Icon name="close" />
              </button>
            </header>
            <div className="pm-product-detail-visual">
              <Icon name="medicine" size={56} />
              <span>OTC</span>
            </div>
            <h2 id="product-title">{detail.brand}</h2>
            <p className="pm-product-maker">
              {detail.maker} · {detail.generic} {detail.strength}
            </p>
            <dl>
              <div>
                <dt>Active ingredient</dt>
                <dd>{detail.ingredient}</dd>
              </div>
              <div>
                <dt>Maximum purchase</dt>
                <dd>{detail.limit} packs per order</dd>
              </div>
            </dl>
            {detail.strip != null ? <fieldset>
              <legend>Choose packaging</legend>
              <div className="pm-pack-toggle">
                <button
                  className={detailPack === 'strip' ? 'active' : ''}
                  onClick={() => setDetailPack('strip')}
                  type="button"
                >
                  Single pack <strong>{money(detail.strip)}</strong>
                </button>
                <button
                  className={detailPack === 'box' ? 'active' : ''}
                  onClick={() => setDetailPack('box')}
                  type="button"
                >
                  Full box <strong>{money(detail.box)}</strong>
                </button>
              </div>
            </fieldset> : (
              <p className="pm-product-price-note">Price will appear here once it has been set.</p>
            )}
            {detail.strip != null && <div className="pm-drawer-quantity">
              <span>
                <strong>Quantity</strong>
                <small>Maximum {detail.limit} packs</small>
              </span>
              <div>
                <button
                  onClick={() => setDetailQuantity((value) => Math.max(1, value - 1))}
                  disabled={detailQuantity === 1}
                  aria-label="Decrease quantity"
                  type="button"
                >
                  <Icon name="minus" />
                </button>
                <b>{detailQuantity}</b>
                <button
                  onClick={() => setDetailQuantity((value) => Math.min(detail.limit, value + 1))}
                  disabled={detailQuantity === detail.limit}
                  aria-label="Increase quantity"
                  type="button"
                >
                  <Icon name="plus" />
                </button>
              </div>
            </div>}
            <aside className="pm-guidance-box">
              <Icon name="info" />
              <div>
                <h3>Patient guidance</h3>
                <p>
                  <strong>Dosage:</strong> {detail.guide}
                </p>
                <p>
                  <strong>Timing:</strong> {detail.timing}
                </p>
                <p className="warning">
                  <strong>Daily limit:</strong> {detail.warning}
                </p>
              </div>
            </aside>
            <button
              className="pm-drawer-add"
              onClick={() => {
                if (!detail.inStock) {
                  requestRestockAlert(detail);
                  return;
                }
                setQuantity(detail, detailQuantity, detailPack);
                setDetail(null);
              }}
              disabled={(detail.inStock && detail.strip == null) || (!detail.inStock && restockAlerts.has(detail.id))}
              type="button"
            >
              {!detail.inStock
                ? restockAlerts.has(detail.id) ? 'Restock reminder set' : 'Notify me when in stock'
                : detail.strip == null
                ? 'Price not set'
                : `Add to Cart · ${money(detail[detailPack] * detailQuantity)}`}
            </button>
          </section>
        </div>
      , document.body)}
      {checkout && createPortal(
        <div className="pm-checkout-backdrop" role="presentation">
          <section className="pm-checkout-modal" aria-labelledby="checkout-title">
            <header>
              <div>
                <h2 id="checkout-title">
                  Your Cart
                </h2>
              </div>
              <button className="pm-checkout-back" onClick={() => navigate('/patient/cart', { replace: true })} type="button">
                <Icon name="back" size={18} />
              </button>
            </header>
            <div className="pm-cart-type-tabs" role="tablist">
              <button className="active" role="tab" aria-selected="true" type="button">OTC Medicines</button>
              <button role="tab" aria-selected="false" onClick={() => navigate('/patient/cart?type=rx')} type="button">Prescription Medicines</button>
            </div>
            <div className="pm-checkout-progress">
              <span className={step >= 0 ? 'active' : ''} />
              <span className={step >= 1 ? 'active' : ''} />
              <span className={step === 2 ? 'active' : ''} />
            </div>
            {error && (
              <div className="pm-shop-error" role="alert">
                {error}
              </div>
            )}
            {step === 0 ? (
              <div className="pm-cart-review">
                <div className="pm-cart-review__items">
                  {cartItems.map(({ product, pack, quantity }) => (
                    <article key={product.id}>
                      <span className="pm-cart-review__visual"><Icon name="medicine" size={27} /></span>
                      <div>
                        <strong>{product.brand}</strong>
                        <small>{pack === 'box' ? 'Full box' : product.pack}</small>
                        <b>{money(product[pack] * quantity)}</b>
                      </div>
                      <div className="pm-cart-review__quantity">
                        <button aria-label={`Remove one ${product.brand}`} onClick={() => setQuantity(product, quantity - 1, pack)} type="button"><Icon name="minus" size={16} /></button>
                        <strong>{quantity}</strong>
                        <button aria-label={`Add one ${product.brand}`} disabled={quantity >= product.limit} onClick={() => setQuantity(product, quantity + 1, pack)} type="button"><Icon name="plus" size={16} /></button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="pm-cart-review__totals">
                  <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  <div><span>Delivery fee</span><strong>Calculated at checkout</strong></div>
                  <div className="total"><span>Total</span><strong>{money(subtotal)}</strong></div>
                </div>
                <button className="pm-checkout-primary" onClick={() => setStep(1)} type="button">
                  Proceed to Checkout
                </button>
              </div>
            ) : step === 1 ? (
              <div className="pm-checkout-step">
                <fieldset>
                  <legend>How would you like to receive it?</legend>
                  <div className="pm-fulfillment-options">
                    <button
                      className={fulfillment === 'delivery' ? 'active' : ''}
                      onClick={() => setFulfillment('delivery')}
                      type="button"
                    >
                      <Icon name="delivery" />
                      <span>
                        <strong>Doorstep Delivery</strong>
                        <small>₱60 · Standard delivery</small>
                      </span>
                    </button>
                    <button
                      className={fulfillment === 'pickup' ? 'active' : ''}
                      onClick={() => setFulfillment('pickup')}
                      type="button"
                    >
                      <Icon name="store" />
                      <span>
                        <strong>Branch Pickup</strong>
                        <small>Free · Pick up when ready</small>
                      </span>
                    </button>
                  </div>
                </fieldset>
                <label>
                  <span>Full name</span>
                  <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Full name" />
                </label>
                <label>
                  <span>Contact number</span>
                  <input
                    inputMode="tel"
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    placeholder="09XX XXX XXXX"
                  />
                  <small>You may use your caregiver’s number.</small>
                </label>
                {fulfillment === 'delivery' ? (
                  <>
                    <label><span>Region</span><select value={region} onChange={(event) => { setRegion(event.target.value); setProvince(''); setCity(''); setBarangay(''); }}><option value="">Select region</option>{Object.keys(ADDRESS_OPTIONS).map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label><span>Province</span><select disabled={!region} value={province} onChange={(event) => { setProvince(event.target.value); setCity(''); setBarangay(''); }}><option value="">Select province</option>{region && Object.keys(ADDRESS_OPTIONS[region]).map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label><span>City / Municipality</span><select disabled={!province} value={city} onChange={(event) => { setCity(event.target.value); setBarangay(''); }}><option value="">Select city or municipality</option>{province && Object.keys(ADDRESS_OPTIONS[region][province]).map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label><span>Barangay</span><select disabled={!city} value={barangay} onChange={(event) => setBarangay(event.target.value)}><option value="">Select barangay</option>{city && ADDRESS_OPTIONS[region][province][city].map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label><span>Postal code</span><input inputMode="numeric" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="e.g. 1101" /></label>
                    <label><span>Street name</span><input value={streetName} onChange={(event) => setStreetName(event.target.value)} placeholder="Street or subdivision" /></label>
                    <label><span>Building / unit <small>Optional</small></span><input value={building} onChange={(event) => setBuilding(event.target.value)} placeholder="Building, floor, or unit" /></label>
                    <label><span>Delivery instructions <small>Optional</small></span><input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} placeholder="Gate color, floor, or delivery note" /></label>
                  </>
                ) : (
                  <label>
                    <span>Pickup branch</span>
                    <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                      <option value="">Choose a branch</option>
                      {branches.map((branch) => (
                        <option value={branch.id} key={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="pm-checkout-primary" onClick={continueCheckout} type="button">
                  Continue to Payment &amp; Summary
                </button>
              </div>
            ) : (
              <div className="pm-checkout-step">
                <div className="pm-cash-payment-notice" role="note">
                  <Icon name="wallet" />
                  <div>
                    <strong>Cash payment only</strong>
                    <span>
                      {fulfillment === 'delivery'
                        ? 'Pay cash when your order is delivered.'
                        : 'Pay cash when you collect your order at the branch.'}
                    </span>
                  </div>
                </div>
                <div className="pm-price-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Delivery fee</span>
                    <strong>{deliveryFee ? money(deliveryFee) : 'Free'}</strong>
                  </div>
                  <div className="total">
                    <span>Total</span>
                    <strong>{money(total)}</strong>
                  </div>
                </div>
                <div className="pm-checkout-actions">
                  <button onClick={() => setStep(1)} type="button">
                    Back
                  </button>
                  <button disabled={placing} onClick={placeOrder} type="button">
                    {placing ? 'Placing Order…' : 'Place Order'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      , document.body)}
    </main>
  );
}
