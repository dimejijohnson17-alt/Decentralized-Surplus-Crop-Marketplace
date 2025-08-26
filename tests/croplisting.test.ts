import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Listing {
  seller: string;
  cropType: string;
  quantity: number;
  pricePerKg: number;
  location: string;
  qualityGrade: string;
  harvestDate: number;
  expiration: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

interface Tags {
  tags: string[];
}

interface Certifications {
  certifications: string[];
}

interface SellerListings {
  listingIds: number[];
}

interface ContractState {
  listings: Map<number, Listing>;
  listingTags: Map<number, Tags>;
  listingCertifications: Map<number, Certifications>;
  sellerListings: Map<string, SellerListings>;
  listingCounter: number;
  paused: boolean;
  contractOwner: string;
  blockHeight: number; // Mocked block height
}

// Mock contract implementation
class CropListingMock {
  private state: ContractState = {
    listings: new Map(),
    listingTags: new Map(),
    listingCertifications: new Map(),
    sellerListings: new Map(),
    listingCounter: 0,
    paused: false,
    contractOwner: "deployer",
    blockHeight: 1000, // Starting mock block height
  };

  private ERR_INVALID_QUANTITY = 100;
  private ERR_INVALID_PRICE = 101;
  private ERR_INVALID_EXPIRATION = 102;
  private ERR_INVALID_LOCATION = 103;
  private ERR_INVALID_CROP_TYPE = 104;
  private ERR_INVALID_QUALITY_GRADE = 105;
  private ERR_LISTING_NOT_FOUND = 106;
  private ERR_NOT_OWNER = 107;
  private ERR_LISTING_EXPIRED = 108;
  private ERR_INVALID_STATUS = 110;
  private ERR_INVALID_TAGS = 111;
  private ERR_INVALID_CERTIFICATIONS = 112;
  private ERR_INVALID_HARVEST_DATE = 114;
  private ERR_PAUSED = 115;
  private ERR_UNAUTHORIZED = 116;

  private MAX_TAGS = 10;
  private MAX_CERTIFICATIONS = 5;
  private STATUS_ACTIVE = "active";
  private STATUS_SOLD = "sold";
  private STATUS_CANCELLED = "cancelled";

  // Helper to advance block height for testing expiration
  advanceBlockHeight(blocks: number): void {
    this.state.blockHeight += blocks;
  }

  createListing(
    caller: string,
    cropType: string,
    quantity: number,
    pricePerKg: number,
    location: string,
    qualityGrade: string,
    harvestDate: number,
    expiration: number,
    tags: string[],
    certifications: string[]
  ): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (quantity <= 0) {
      return { ok: false, value: this.ERR_INVALID_QUANTITY };
    }
    if (pricePerKg <= 0) {
      return { ok: false, value: this.ERR_INVALID_PRICE };
    }
    if (expiration <= this.state.blockHeight) {
      return { ok: false, value: this.ERR_INVALID_EXPIRATION };
    }
    if (location.length === 0) {
      return { ok: false, value: this.ERR_INVALID_LOCATION };
    }
    if (cropType.length === 0) {
      return { ok: false, value: this.ERR_INVALID_CROP_TYPE };
    }
    if (qualityGrade.length === 0) {
      return { ok: false, value: this.ERR_INVALID_QUALITY_GRADE };
    }
    if (harvestDate > this.state.blockHeight) {
      return { ok: false, value: this.ERR_INVALID_HARVEST_DATE };
    }
    if (tags.length > this.MAX_TAGS) {
      return { ok: false, value: this.ERR_INVALID_TAGS };
    }
    if (certifications.length > this.MAX_CERTIFICATIONS) {
      return { ok: false, value: this.ERR_INVALID_CERTIFICATIONS };
    }

    const listingId = this.state.listingCounter + 1;
    this.state.listingCounter = listingId;
    this.state.listings.set(listingId, {
      seller: caller,
      cropType,
      quantity,
      pricePerKg,
      location,
      qualityGrade,
      harvestDate,
      expiration,
      status: this.STATUS_ACTIVE,
      createdAt: this.state.blockHeight,
      updatedAt: this.state.blockHeight,
    });
    this.state.listingTags.set(listingId, { tags });
    this.state.listingCertifications.set(listingId, { certifications });

    const sellerListings = this.state.sellerListings.get(caller) ?? { listingIds: [] };
    sellerListings.listingIds.push(listingId);
    this.state.sellerListings.set(caller, sellerListings);

    return { ok: true, value: listingId };
  }

  updateListing(
    caller: string,
    listingId: number,
    newQuantity?: number,
    newPricePerKg?: number,
    newExpiration?: number,
    newTags?: string[],
    newCertifications?: string[]
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const listing = this.state.listings.get(listingId);
    if (!listing) {
      return { ok: false, value: this.ERR_LISTING_NOT_FOUND };
    }
    if (listing.seller !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (listing.status !== this.STATUS_ACTIVE || listing.expiration <= this.state.blockHeight) {
      return { ok: false, value: this.ERR_LISTING_EXPIRED };
    }

    if (newQuantity !== undefined && newQuantity <= 0) {
      return { ok: false, value: this.ERR_INVALID_QUANTITY };
    }
    if (newPricePerKg !== undefined && newPricePerKg <= 0) {
      return { ok: false, value: this.ERR_INVALID_PRICE };
    }
    if (newExpiration !== undefined && newExpiration <= this.state.blockHeight) {
      return { ok: false, value: this.ERR_INVALID_EXPIRATION };
    }
    if (newTags !== undefined && newTags.length > this.MAX_TAGS) {
      return { ok: false, value: this.ERR_INVALID_TAGS };
    }
    if (newCertifications !== undefined && newCertifications.length > this.MAX_CERTIFICATIONS) {
      return { ok: false, value: this.ERR_INVALID_CERTIFICATIONS };
    }

    const updatedListing = {
      ...listing,
      quantity: newQuantity ?? listing.quantity,
      pricePerKg: newPricePerKg ?? listing.pricePerKg,
      expiration: newExpiration ?? listing.expiration,
      updatedAt: this.state.blockHeight,
    };
    this.state.listings.set(listingId, updatedListing);

    if (newTags !== undefined) {
      this.state.listingTags.set(listingId, { tags: newTags });
    }
    if (newCertifications !== undefined) {
      this.state.listingCertifications.set(listingId, { certifications: newCertifications });
    }

    return { ok: true, value: true };
  }

  cancelListing(caller: string, listingId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const listing = this.state.listings.get(listingId);
    if (!listing) {
      return { ok: false, value: this.ERR_LISTING_NOT_FOUND };
    }
    if (listing.seller !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (listing.status !== this.STATUS_ACTIVE) {
      return { ok: false, value: this.ERR_INVALID_STATUS };
    }

    const updatedListing = {
      ...listing,
      status: this.STATUS_CANCELLED,
      updatedAt: this.state.blockHeight,
    };
    this.state.listings.set(listingId, updatedListing);
    return { ok: true, value: true };
  }

  markAsSold(caller: string, listingId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const listing = this.state.listings.get(listingId);
    if (!listing) {
      return { ok: false, value: this.ERR_LISTING_NOT_FOUND };
    }
    if (listing.seller !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (listing.status !== this.STATUS_ACTIVE) {
      return { ok: false, value: this.ERR_INVALID_STATUS };
    }

    const updatedListing = {
      ...listing,
      status: this.STATUS_SOLD,
      updatedAt: this.state.blockHeight,
    };
    this.state.listings.set(listingId, updatedListing);
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  getListingDetails(listingId: number): ClarityResponse<Listing | null> {
    return { ok: true, value: this.state.listings.get(listingId) ?? null };
  }

  getListingTags(listingId: number): ClarityResponse<Tags | null> {
    return { ok: true, value: this.state.listingTags.get(listingId) ?? null };
  }

  getListingCertifications(listingId: number): ClarityResponse<Certifications | null> {
    return { ok: true, value: this.state.listingCertifications.get(listingId) ?? null };
  }

  getSellerListings(seller: string): ClarityResponse<SellerListings | null> {
    return { ok: true, value: this.state.sellerListings.get(seller) ?? null };
  }

  isListingActive(listingId: number): ClarityResponse<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing) {
      return { ok: true, value: false };
    }
    return { ok: true, value: listing.status === this.STATUS_ACTIVE && listing.expiration > this.state.blockHeight };
  }

  getContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getListingCounter(): ClarityResponse<number> {
    return { ok: true, value: this.state.listingCounter };
  }

  getContractOwner(): ClarityResponse<string> {
    return { ok: true, value: this.state.contractOwner };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  farmer1: "farmer_1",
  farmer2: "farmer_2",
  unauthorized: "unauthorized",
};

describe("CropListing Contract", () => {
  let contract: CropListingMock;

  beforeEach(() => {
    contract = new CropListingMock();
    vi.resetAllMocks();
  });

  it("should create a new listing successfully", () => {
    const createResult = contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900, // Harvest date before current block 1000
      2000, // Expiration after 1000
      ["organic", "fresh"],
      ["USDA Certified"]
    );
    expect(createResult).toEqual({ ok: true, value: 1 });

    const details = contract.getListingDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        seller: accounts.farmer1,
        cropType: "Apples",
        quantity: 1000,
        pricePerKg: 500,
        status: "active",
      }),
    });

    const tags = contract.getListingTags(1);
    expect(tags).toEqual({ ok: true, value: { tags: ["organic", "fresh"] } });

    const certifications = contract.getListingCertifications(1);
    expect(certifications).toEqual({ ok: true, value: { certifications: ["USDA Certified"] } });

    const sellerListings = contract.getSellerListings(accounts.farmer1);
    expect(sellerListings).toEqual({ ok: true, value: { listingIds: [1] } });
  });

  it("should prevent creating listing with invalid parameters", () => {
    const invalidQuantity = contract.createListing(
      accounts.farmer1,
      "Apples",
      0,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      [],
      []
    );
    expect(invalidQuantity).toEqual({ ok: false, value: 100 });

    const invalidExpiration = contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      900, // Before current block
      [],
      []
    );
    expect(invalidExpiration).toEqual({ ok: false, value: 102 });

    const invalidHarvest = contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      1100, // After current block
      2000,
      [],
      []
    );
    expect(invalidHarvest).toEqual({ ok: false, value: 114 });
  });

  it("should update an existing listing", () => {
    contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      ["organic"],
      ["USDA"]
    );

    const updateResult = contract.updateListing(
      accounts.farmer1,
      1,
      1500, // New quantity
      600, // New price
      undefined,
      ["organic", "red"],
      undefined
    );
    expect(updateResult).toEqual({ ok: true, value: true });

    const details = contract.getListingDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        quantity: 1500,
        pricePerKg: 600,
      }),
    });

    const tags = contract.getListingTags(1);
    expect(tags).toEqual({ ok: true, value: { tags: ["organic", "red"] } });
  });

  it("should prevent unauthorized update", () => {
    contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      [],
      []
    );

    const updateResult = contract.updateListing(accounts.unauthorized, 1, 1500);
    expect(updateResult).toEqual({ ok: false, value: 107 });
  });

  it("should cancel an active listing", () => {
    contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      [],
      []
    );

    const cancelResult = contract.cancelListing(accounts.farmer1, 1);
    expect(cancelResult).toEqual({ ok: true, value: true });

    const details = contract.getListingDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "cancelled" }),
    });

    const isActive = contract.isListingActive(1);
    expect(isActive).toEqual({ ok: true, value: false });
  });

  it("should mark listing as sold", () => {
    contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      [],
      []
    );

    const soldResult = contract.markAsSold(accounts.farmer1, 1);
    expect(soldResult).toEqual({ ok: true, value: true });

    const details = contract.getListingDetails(1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "sold" }),
    });
  });

  it("should handle expiration checks", () => {
    contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      1010, // Expires at 1010
      [],
      []
    );

    let isActive = contract.isListingActive(1);
    expect(isActive).toEqual({ ok: true, value: true });

    contract.advanceBlockHeight(20); // Now at 1020

    isActive = contract.isListingActive(1);
    expect(isActive).toEqual({ ok: true, value: false });

    const updateAfterExpire = contract.updateListing(accounts.farmer1, 1, 1500);
    expect(updateAfterExpire).toEqual({ ok: false, value: 108 });
  });

  it("should pause and unpause the contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.getContractPaused()).toEqual({ ok: true, value: true });

    const createDuringPause = contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      [],
      []
    );
    expect(createDuringPause).toEqual({ ok: false, value: 115 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.getContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-owner from pausing", () => {
    const pauseResult = contract.pauseContract(accounts.unauthorized);
    expect(pauseResult).toEqual({ ok: false, value: 116 });
  });

  it("should return seller listings correctly", () => {
    contract.createListing(
      accounts.farmer1,
      "Apples",
      1000,
      500,
      "California, USA",
      "Premium",
      900,
      2000,
      [],
      []
    );
    contract.createListing(
      accounts.farmer1,
      "Oranges",
      2000,
      400,
      "Florida, USA",
      "Standard",
      950,
      2000,
      [],
      []
    );

    const sellerListings = contract.getSellerListings(accounts.farmer1);
    expect(sellerListings).toEqual({ ok: true, value: { listingIds: [1, 2] } });
  });
});