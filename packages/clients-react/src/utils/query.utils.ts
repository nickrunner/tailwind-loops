import { useCallback, useMemo } from "react";
import {
  type QueryClient,
  type QueryKey,
  type QueryObserverResult,
  type RefetchOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type MutationFunction,
} from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Remote — object-based (replaces Stays' array-based Remote<T>)
// ---------------------------------------------------------------------------

export interface Remote<T> {
  /** The resolved data, or undefined while loading */
  data: T | undefined;
  /** Optimistically update the cached data */
  setData: (newData: T) => void;
  /** True while the initial fetch is in progress */
  isLoading: boolean;
  /** The error if the query failed, otherwise undefined */
  error: Error | undefined;
  /** Refetch the data */
  refetch: (
    options?: RefetchOptions,
  ) => Promise<QueryObserverResult<T, unknown>>;
}

// ---------------------------------------------------------------------------
// Query signature — stable cache key builder
// ---------------------------------------------------------------------------

export interface Signature {
  keys: string[];
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// useRemote — the primary data-fetching hook
// ---------------------------------------------------------------------------

export type RemoteQueryOptions<T> = Omit<
  UseQueryOptions<T>,
  "queryKey" | "queryFn"
>;

export function useRemote<T>(
  queryFn: () => Promise<T>,
  signature: Signature,
  options?: RemoteQueryOptions<T>,
): Remote<T> {
  const queryClient = useQueryClient();

  const memoizedQueryFn = useCallback(() => queryFn(), [queryFn]);

  const queryKey: QueryKey = useMemo(
    () =>
      signature.params
        ? [...signature.keys, signature.params]
        : signature.keys,
    [signature.keys, signature.params],
  );

  const query = useQuery<T>({
    queryKey,
    queryFn: memoizedQueryFn,
    ...options,
  });

  return useMemo(
    () => ({
      data: query.data,
      setData: (newData: T) => queryClient.setQueryData(queryKey, newData),
      isLoading: query.isLoading,
      error: query.isError ? (query.error as Error) : undefined,
      refetch: query.refetch,
    }),
    [query.data, query.isLoading, query.isError, query.error, query.refetch, queryClient, queryKey],
  );
}

// ---------------------------------------------------------------------------
// Invalidation helpers
// ---------------------------------------------------------------------------

export function invalidateQueriesContaining(
  queryClient: QueryClient,
  queryKeys: string[],
): void {
  const allQueryKeys = queryClient
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey);

  const matchingKeys = allQueryKeys.filter((key) =>
    Array.isArray(key)
      ? key.some((k) => typeof k === "string" && queryKeys.includes(k))
      : queryKeys.includes(String(key)),
  );

  for (const key of matchingKeys) {
    queryClient.invalidateQueries({ queryKey: key, exact: true });
  }
}

export function useQueryInvalidation(queryKeys: string[]): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    invalidateQueriesContaining(queryClient, queryKeys);
  }, [queryClient, queryKeys]);
}

// ---------------------------------------------------------------------------
// useMutation wrapper with optimistic updates
// ---------------------------------------------------------------------------

export function useDataMutation<TMutationResponse, TPostData, TCachedData>(params: {
  queryKey: string[];
  mutationFn: MutationFunction<TMutationResponse, TPostData>;
  optimisticUpdate?: (
    oldData: TCachedData | undefined,
    newData: TPostData,
  ) => TCachedData | undefined;
  onSuccess?: (
    data: TMutationResponse,
    variables: TPostData,
    queryClient: QueryClient,
  ) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation<TMutationResponse, unknown, TPostData>({
    mutationFn: params.mutationFn,
    onMutate: async (newData: TPostData) => {
      await queryClient.cancelQueries({ queryKey: params.queryKey });
      const previousData = queryClient.getQueryData<TCachedData>(
        params.queryKey,
      );
      if (params.optimisticUpdate) {
        queryClient.setQueryData<TCachedData | undefined>(
          params.queryKey,
          (oldData) => params.optimisticUpdate?.(oldData, newData),
        );
      }
      return { previousData };
    },
    onSuccess: (data, variables) => {
      params.onSuccess?.(data, variables, queryClient);
    },
    onError: (_err, _newData, context) => {
      queryClient.setQueryData(
        params.queryKey,
        (context as { previousData: unknown } | undefined)?.previousData,
      );
    },
    onSettled: () => {
      invalidateQueriesContaining(queryClient, params.queryKey);
    },
  });
}
