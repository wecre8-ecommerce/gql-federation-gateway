const { ApolloServer } = require("apollo-server-express");
const { ApolloServerPluginInlineTraceDisabled } = require("apollo-server-core");
const { ApolloGateway, IntrospectAndCompose } = require("@apollo/gateway");
const {
  default: FileUploadDataSource,
} = require("@profusion/apollo-federation-upload");
const express = require("express");
const http = require("http");
const { graphqlUploadExpress } = require("graphql-upload");

const { subgraphs, pollIntervalInMs, isAllowedHeader } = require("./config");

const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs,
    pollIntervalInMs,
  }),
  buildService({ url }) {
    return new FileUploadDataSource({
      url,
      useChunkedTransfer: true,
      willSendRequest({ request, context }) {
        const headers = context.headers;

        if (headers) {
          const entries = Object.entries(headers);

          entries.forEach(([header, value]) => {
            if (isAllowedHeader(header)) {
              request.http.headers.set(header, value);
            }
          });
        }
      },
    });
  },
});

(async () => {
  const app = express();
  app.use(graphqlUploadExpress());

  const server = new ApolloServer({
    gateway,
    plugins: [ApolloServerPluginInlineTraceDisabled()],
    context({ req }) {
      return req;
    },
  });
  await server.start();
  server.applyMiddleware({
    app,
    cors: {
      // FIXME: Use env var on production whitelist production URLs
      origin: true,
      methods: "GET,POST",
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
    },
  });

  await new Promise((resolve) =>
    app.listen(parseInt(process.env.PORT || 4000, 10), "localhost", resolve)
  );

  for (let { name, url } of subgraphs) {
    console.log(`-- Service ${name} federated from: ${url}`);
  }

  console.log("\n");
  console.log(`🚀 Server ready at ${server.graphqlPath}`);
})();
