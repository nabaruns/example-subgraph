import { cosmos, log, BigInt, BigDecimal } from "@graphprotocol/graph-ts";
import { snapshotFinancials, snapshotMarket, updateAllMarketPrices, updateProtocol } from ".";
import { FeedPrice, LendingProtocol, Market } from "../../generated/schema";
import { PROTOCOL_ADDRESS, pTokenAddrMap } from "../constants";

export function _handleOracleFeed(data: cosmos.EventData, i: i32): void {
    let protocol = LendingProtocol.load(PROTOCOL_ADDRESS);
    if (!protocol) {
      log.warning("[_handleOracleFeed] protocol not found: {}", [
        PROTOCOL_ADDRESS,
      ]);
      return;
    }

    const asset = data.event.attributes[i].value;
    if (!pTokenAddrMap.has(asset)) {
      return;
    }
    let marketID = pTokenAddrMap.get(asset);
    let market = Market.load(marketID);
    if (!market) {
      log.warning("[_handleOracleFeed] Market not found: {}", [marketID]);
    }

    const timestamp = BigInt.fromString(data.block.header.time.seconds.toString());
    const blockNumber = BigInt.fromU64(data.block.header.height);

    let feedPrice = FeedPrice.load(marketID);
    if (!feedPrice) {
        feedPrice = new FeedPrice(marketID);
    }
    feedPrice.protocol = protocol.id;
    feedPrice.blockNumber = blockNumber;
    feedPrice.timestamp = timestamp;
    feedPrice.tokenPriceUSD = BigDecimal.fromString(data.event.attributes[i+1].value);
    feedPrice.save();

    if (market != null) {
        market.inputTokenPriceUSD = feedPrice.tokenPriceUSD;
        market.save();

        snapshotMarket(
        marketID,
        blockNumber,
        timestamp
        );

        updateAllMarketPrices(PROTOCOL_ADDRESS, blockNumber);
        updateProtocol(PROTOCOL_ADDRESS);

        snapshotFinancials(
        PROTOCOL_ADDRESS,
        blockNumber,
        timestamp,
        );
    }

}