import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import PrescriptionShop from './PrescriptionShop.jsx';

const PRODUCTS = [
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
const CATEGORIES = ['All', 'Pain Relief', 'Cold & Flu', 'Vitamins', 'First Aid'];

function Icon({ name, size = 22 }) {
  const paths = {
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

export default function Shop() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('otc');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState({});
  const [detail, setDetail] = useState(null);
  const [detailPack, setDetailPack] = useState('strip');
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState({ address: '', contact_num: '' });
  const [branches, setBranches] = useState([]);
  const [fulfillment, setFulfillment] = useState('delivery');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [branchId, setBranchId] = useState('');
  const [payment, setPayment] = useState('cod');
  const [discount, setDiscount] = useState(false);
  const [discountId, setDiscountId] = useState('');
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  useEffect(() => {
    Promise.all([
      api('/api/patient/profile')
        .then((r) => r.data)
        .catch(() => ({})),
      api('/api/directory/branches')
        .then((r) => r.data)
        .catch(() => []),
    ]).then(([patient, branchList]) => {
      setProfile(patient);
      setAddress(patient.address || '');
      setContact(patient.contact_num || '');
      setBranches(branchList);
      setBranchId(branchList[0]?.id || '');
    });
  }, []);
  const shown = useMemo(
    () =>
      PRODUCTS.filter((product) => {
        const query = search.trim().toLowerCase();
        return (
          (category === 'All' || product.category === category) &&
          (!query ||
            `${product.brand} ${product.generic} ${product.ingredient}`
              .toLowerCase()
              .includes(query))
        );
      }),
    [category, search]
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
  }
  function openDetails(product) {
    setDetail(product);
    setDetailPack(cart[product.id]?.pack || 'strip');
    setDetailQuantity(Math.max(1, cart[product.id]?.quantity || 1));
  }
  function startCheckout() {
    setError('');
    setStep(1);
    setCheckout(true);
  }
  function continueCheckout() {
    if (fulfillment === 'delivery' && !address.trim())
      return setError('Enter the delivery address.');
    if (!contact.trim()) return setError('Enter a contact number for order updates.');
    if (fulfillment === 'pickup' && !branchId) return setError('Choose a pickup branch.');
    setError('');
    setStep(2);
  }
  function placeOrder() {
    if (discount && !discountId.trim())
      return setError('Enter the Senior Citizen or PWD ID number.');
    setPlacing(true);
    setError('');
    const id = `PM-${Date.now().toString().slice(-8)}`;
    const order = {
      id,
      created_at: new Date().toISOString(),
      status: 'order_placed',
      fulfillment,
      address: fulfillment === 'delivery' ? address.trim() : '',
      contact: contact.trim(),
      branch_id: branchId,
      branch: branches.find((item) => item.id === branchId)?.name || 'Selected branch',
      payment,
      discount: discount ? 'Senior Citizen / PWD 20%' : '',
      discount_id: discountId.trim(),
      subtotal,
      delivery_fee: deliveryFee,
      discount_amount: discountAmount,
      total,
      items: cartItems.map(({ product, pack, quantity }) => ({
        id: product.id,
        name: `${product.brand} (${product.generic})`,
        pack: pack === 'box' ? 'Full box' : product.pack,
        quantity,
        unit_price: product[pack],
      })),
    };
    try {
      const previous = JSON.parse(localStorage.getItem('pm_otc_orders') || '[]');
      localStorage.setItem('pm_otc_orders', JSON.stringify([order, ...previous]));
      localStorage.setItem('pm_last_otc_order', id);
      setCart({});
      setCheckout(false);
      navigate(`/patient/orders?placed=${encodeURIComponent(id)}`);
    } catch {
      setError('The order could not be saved on this device. Please try again.');
      setPlacing(false);
    }
  }

  if (mode === 'rx')
    return (
      <main className="pm-shop-page">
        <header className="pm-shop-header">
          <div>
            <h1>Pharmacy Shop</h1>
            <p>OTC and pharmacist-gated prescription orders.</p>
          </div>
        </header>
        <div className="pm-shop-mode-tabs" role="tablist">
          <button onClick={() => setMode('otc')} role="tab" aria-selected="false" type="button">
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
    <main className="pm-shop-page">
      <header className="pm-shop-header">
        <div>
          <h1>Pharmacy Shop</h1>
          <p>OTC and pharmacist-gated prescription orders.</p>
        </div>
        <button
          aria-label={`Open cart with ${itemCount} items`}
          onClick={startCheckout}
          disabled={!itemCount}
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
        <button onClick={() => setMode('rx')} role="tab" aria-selected="false" type="button">
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
      <label className="pm-shop-search">
        <Icon name="search" />
        <input
          list="otc-medicine-list"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search brand or generic medicine"
        />
        <datalist id="otc-medicine-list">
          {PRODUCTS.map((product) => (
            <option value={`${product.brand} / ${product.generic}`} key={product.id} />
          ))}
        </datalist>
        <span className="visually-hidden">Search OTC medicines</span>
      </label>
      <div className="pm-shop-filters" aria-label="Medicine categories">
        {CATEGORIES.map((item) => (
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
                  <em>OTC · Max {product.limit}</em>
                  <h3>{product.brand}</h3>
                  <p>
                    {product.generic} {product.strength}
                  </p>
                  <strong>
                    {money(product.strip)} <small>/ pack</small>
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
                    onClick={() => setQuantity(product, 1)}
                    type="button"
                  >
                    <Icon name="plus" size={18} /> Add
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
      {itemCount > 0 && (
        <footer className="pm-shop-cart-bar">
          <span>
            <small>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </small>
            <strong>{money(subtotal)}</strong>
          </span>
          <button onClick={startCheckout} type="button">
            Review Cart <Icon name="cart" />
          </button>
        </footer>
      )}
      {detail && (
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
            <fieldset>
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
            </fieldset>
            <div className="pm-drawer-quantity">
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
            </div>
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
                setQuantity(detail, detailQuantity, detailPack);
                setDetail(null);
              }}
              type="button"
            >
              Add to Cart · {money(detail[detailPack] * detailQuantity)}
            </button>
          </section>
        </div>
      )}
      {checkout && (
        <div className="pm-checkout-backdrop" role="presentation">
          <section
            className="pm-checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <header>
              <div>
                <small>Step {step} of 2</small>
                <h2 id="checkout-title">
                  {step === 1 ? 'Delivery Destination' : 'Payment & Summary'}
                </h2>
              </div>
              <button onClick={() => setCheckout(false)} aria-label="Close checkout" type="button">
                <Icon name="close" />
              </button>
            </header>
            <div className="pm-checkout-progress">
              <span className="active" />
              <span className={step === 2 ? 'active' : ''} />
            </div>
            {error && (
              <div className="pm-shop-error" role="alert">
                {error}
              </div>
            )}
            {step === 1 ? (
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
                {fulfillment === 'delivery' ? (
                  <label>
                    <span>
                      Delivery address{' '}
                      <button onClick={() => setAddress(profile.address || '')} type="button">
                        Use saved
                      </button>
                    </span>
                    <textarea
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="House number, street, barangay, city"
                    />
                  </label>
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
                <button className="pm-checkout-primary" onClick={continueCheckout} type="button">
                  Continue to Payment
                </button>
              </div>
            ) : (
              <div className="pm-checkout-step">
                <fieldset>
                  <legend>Payment method</legend>
                  <div className="pm-payment-options">
                    {[
                      ['cod', 'Cash on Delivery'],
                      ['gcash', 'GCash on Delivery'],
                      ['maya', 'Maya on Delivery'],
                    ].map(([value, label]) => (
                      <button
                        className={payment === value ? 'active' : ''}
                        onClick={() => setPayment(value)}
                        type="button"
                        key={value}
                      >
                        <Icon name="wallet" />
                        <span>{label}</span>
                        {payment === value && <Icon name="check" size={18} />}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="pm-discount-check">
                  <input
                    type="checkbox"
                    checked={discount}
                    onChange={(event) => setDiscount(event.target.checked)}
                  />
                  <span>
                    <strong>Apply Senior Citizen / PWD 20% discount</strong>
                    <small>Valid ID is required upon delivery or pickup.</small>
                  </span>
                </label>
                {discount && (
                  <label>
                    <span>Senior Citizen / PWD ID number</span>
                    <input
                      value={discountId}
                      onChange={(event) => setDiscountId(event.target.value)}
                      placeholder="Enter ID number"
                    />
                  </label>
                )}
                <div className="pm-price-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Delivery fee</span>
                    <strong>{deliveryFee ? money(deliveryFee) : 'Free'}</strong>
                  </div>
                  {discount && (
                    <div className="discount">
                      <span>20% discount</span>
                      <strong>−{money(discountAmount)}</strong>
                    </div>
                  )}
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
      )}
    </main>
  );
}
