;; CropListing.clar
;; Core contract for managing surplus crop listings in the Decentralized Surplus Crop Marketplace
;; This contract allows farmers to create, update, and manage listings of surplus crops,
;; enabling direct sales to buyers while reducing food waste through efficient distribution.

;; Constants
(define-constant ERR-INVALID-QUANTITY u100) ;; Quantity must be positive
(define-constant ERR-INVALID-PRICE u101) ;; Price must be positive
(define-constant ERR-INVALID-EXPIRATION u102) ;; Expiration must be in the future
(define-constant ERR-INVALID-LOCATION u103) ;; Location string too long or empty
(define-constant ERR-INVALID-CROP-TYPE u104) ;; Crop type invalid
(define-constant ERR-INVALID-QUALITY-GRADE u105) ;; Quality grade invalid
(define-constant ERR-LISTING-NOT-FOUND u106) ;; Listing does not exist
(define-constant ERR-NOT-OWNER u107) ;; Caller is not the owner of the listing
(define-constant ERR-LISTING-EXPIRED u108) ;; Listing has expired
(define-constant ERR-LISTING-SOLD u109) ;; Listing already sold
(define-constant ERR-INVALID-STATUS u110) ;; Invalid status transition
(define-constant ERR-INVALID-TAGS u111) ;; Too many tags or invalid
(define-constant ERR-INVALID-CERTIFICATIONS u112) ;; Invalid certifications
(define-constant ERR-ALREADY-EXISTS u113) ;; Listing already exists (duplicate check if needed)
(define-constant ERR-INVALID-HARVEST-DATE u114) ;; Harvest date in future or invalid
(define-constant ERR-PAUSED u115) ;; Contract is paused
(define-constant ERR-UNAUTHORIZED u116) ;; Unauthorized access

(define-constant MAX-TAGS u10) ;; Maximum number of tags per listing
(define-constant MAX-CERTIFICATIONS u5) ;; Maximum certifications
(define-constant STATUS-ACTIVE "active")
(define-constant STATUS-SOLD "sold")
(define-constant STATUS-CANCELLED "cancelled")
(define-constant STATUS-EXPIRED "expired")

;; Data Variables
(define-data-var contract-owner principal tx-sender)
(define-data-var listing-counter uint u0)
(define-data-var paused bool false)

;; Data Maps
(define-map listings
  { listing-id: uint }
  {
    seller: principal,
    crop-type: (string-ascii 50),
    quantity: uint, ;; In kilograms
    price-per-kg: uint, ;; In microSTX
    location: (string-ascii 100),
    quality-grade: (string-ascii 20),
    harvest-date: uint, ;; Block height or timestamp
    expiration: uint, ;; Block height when listing expires
    status: (string-ascii 20), ;; active, sold, cancelled, expired
    created-at: uint, ;; Block height of creation
    updated-at: uint ;; Last update block height
  }
)

(define-map listing-tags
  { listing-id: uint }
  { tags: (list 10 (string-ascii 30)) }
)

(define-map listing-certifications
  { listing-id: uint }
  { certifications: (list 5 (string-ascii 50)) } ;; e.g., "organic", "fair-trade"
)

(define-map seller-listings
  { seller: principal }
  { listing-ids: (list 100 uint) } ;; Up to 100 listings per seller for querying
)

;; Private Functions
(define-private (is-owner (listing-id uint) (caller principal))
  (match (map-get? listings { listing-id: listing-id })
    listing (is-eq (get seller listing) caller)
    false
  )
)

(define-private (is-active (listing-id uint))
  (match (map-get? listings { listing-id: listing-id })
    listing (and (is-eq (get status listing) STATUS-ACTIVE)
                 (> (get expiration listing) block-height))
    false
  )
)

(define-private (append-listing-to-seller (seller principal) (listing-id uint))
  (let ((current-ids (default-to (list) (get listing-ids (map-get? seller-listings { seller: seller })))))
    (map-set seller-listings { seller: seller } { listing-ids: (unwrap-panic (as-max-len? (append current-ids listing-id) u100)) })
  )
)

;; Public Functions
(define-public (create-listing 
  (crop-type (string-ascii 50)) 
  (quantity uint) 
  (price-per-kg uint) 
  (location (string-ascii 100)) 
  (quality-grade (string-ascii 20))
  (harvest-date uint)
  (expiration uint)
  (tags (list 10 (string-ascii 30)))
  (certifications (list 5 (string-ascii 50))))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (> quantity u0) (err ERR-INVALID-QUANTITY))
    (asserts! (> price-per-kg u0) (err ERR-INVALID-PRICE))
    (asserts! (> expiration block-height) (err ERR-INVALID-EXPIRATION))
    (asserts! (> (len location) u0) (err ERR-INVALID-LOCATION))
    (asserts! (> (len crop-type) u0) (err ERR-INVALID-CROP-TYPE))
    (asserts! (> (len quality-grade) u0) (err ERR-INVALID-QUALITY-GRADE))
    (asserts! (<= harvest-date block-height) (err ERR-INVALID-HARVEST-DATE))
    (asserts! (<= (len tags) MAX-TAGS) (err ERR-INVALID-TAGS))
    (asserts! (<= (len certifications) MAX-CERTIFICATIONS) (err ERR-INVALID-CERTIFICATIONS))
    
    (let ((listing-id (+ (var-get listing-counter) u1))
          (seller tx-sender)
          (current-height block-height))
      (var-set listing-counter listing-id)
      (map-set listings 
        { listing-id: listing-id }
        {
          seller: seller,
          crop-type: crop-type,
          quantity: quantity,
          price-per-kg: price-per-kg,
          location: location,
          quality-grade: quality-grade,
          harvest-date: harvest-date,
          expiration: expiration,
          status: STATUS-ACTIVE,
          created-at: current-height,
          updated-at: current-height
        }
      )
      (map-set listing-tags { listing-id: listing-id } { tags: tags })
      (map-set listing-certifications { listing-id: listing-id } { certifications: certifications })
      (append-listing-to-seller seller listing-id)
      (print { event: "listing-created", listing-id: listing-id, seller: seller })
      (ok listing-id)
    )
  )
)

(define-public (update-listing 
  (listing-id uint)
  (new-quantity (optional uint))
  (new-price-per-kg (optional uint))
  (new-expiration (optional uint))
  (new-tags (optional (list 10 (string-ascii 30))))
  (new-certifications (optional (list 5 (string-ascii 50)))))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-owner listing-id tx-sender) (err ERR-NOT-OWNER))
    (asserts! (is-active listing-id) (err ERR-LISTING-EXPIRED))
    
    (match (map-get? listings { listing-id: listing-id })
      listing
      (let ((updated-listing (merge listing { updated-at: block-height })))
        (if (is-some new-quantity)
          (asserts! (> (unwrap-panic new-quantity) u0) (err ERR-INVALID-QUANTITY))
          false)
        (if (is-some new-price-per-kg)
          (asserts! (> (unwrap-panic new-price-per-kg) u0) (err ERR-INVALID-PRICE))
          false)
        (if (is-some new-expiration)
          (asserts! (> (unwrap-panic new-expiration) block-height) (err ERR-INVALID-EXPIRATION))
          false)
        (if (is-some new-tags)
          (begin
            (asserts! (<= (len (unwrap-panic new-tags)) MAX-TAGS) (err ERR-INVALID-TAGS))
            (map-set listing-tags { listing-id: listing-id } { tags: (unwrap-panic new-tags) })
          )
          false)
        (if (is-some new-certifications)
          (begin
            (asserts! (<= (len (unwrap-panic new-certifications)) MAX-CERTIFICATIONS) (err ERR-INVALID-CERTIFICATIONS))
            (map-set listing-certifications { listing-id: listing-id } { certifications: (unwrap-panic new-certifications) })
          )
          false)
        (map-set listings { listing-id: listing-id }
          (merge updated-listing {
            quantity: (default-to (get quantity listing) new-quantity),
            price-per-kg: (default-to (get price-per-kg listing) new-price-per-kg),
            expiration: (default-to (get expiration listing) new-expiration)
          })
        )
        (print { event: "listing-updated", listing-id: listing-id })
        (ok true)
      )
      (err ERR-LISTING-NOT-FOUND)
    )
  )
)

(define-public (cancel-listing (listing-id uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-owner listing-id tx-sender) (err ERR-NOT-OWNER))
    (match (map-get? listings { listing-id: listing-id })
      listing
      (if (is-eq (get status listing) STATUS-ACTIVE)
        (begin
          (map-set listings { listing-id: listing-id }
            (merge listing { status: STATUS-CANCELLED, updated-at: block-height })
          )
          (print { event: "listing-cancelled", listing-id: listing-id })
          (ok true)
        )
        (err ERR-INVALID-STATUS)
      )
      (err ERR-LISTING-NOT-FOUND)
    )
  )
)

(define-public (mark-as-sold (listing-id uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    ;; Note: This would typically be called by OrderManagement contract, but for now, allow owner
    (asserts! (is-owner listing-id tx-sender) (err ERR-NOT-OWNER))
    (match (map-get? listings { listing-id: listing-id })
      listing
      (if (is-eq (get status listing) STATUS-ACTIVE)
        (begin
          (map-set listings { listing-id: listing-id }
            (merge listing { status: STATUS-SOLD, updated-at: block-height })
          )
          (print { event: "listing-sold", listing-id: listing-id })
          (ok true)
        )
        (err ERR-INVALID-STATUS)
      )
      (err ERR-LISTING-NOT-FOUND)
    )
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-UNAUTHORIZED))
    (var-set paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-UNAUTHORIZED))
    (var-set paused false)
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-listing-details (listing-id uint))
  (map-get? listings { listing-id: listing-id })
)

(define-read-only (get-listing-tags (listing-id uint))
  (map-get? listing-tags { listing-id: listing-id })
)

(define-read-only (get-listing-certifications (listing-id uint))
  (map-get? listing-certifications { listing-id: listing-id })
)

(define-read-only (get-seller-listings (seller principal))
  (map-get? seller-listings { seller: seller })
)

(define-read-only (is-listing-active (listing-id uint))
  (is-active listing-id)
)

(define-read-only (get-contract-paused)
  (var-get paused)
)

(define-read-only (get-listing-counter)
  (var-get listing-counter)
)

(define-read-only (get-contract-owner)
  (var-get contract-owner)
)